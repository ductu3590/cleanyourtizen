import copy
import json
from pathlib import Path
import tempfile
import unittest
import zipfile
from cyt import core
from cyt.cli import apply_plan, build, check_signed_widget, save_new

ROOT = Path(__file__).resolve().parents[1]
CATALOG = json.loads((ROOT / 'catalog/apps.json').read_text())
INFO = {'device': {'modelName': 'TEST-TV', 'OS': 'Tizen', 'duid': 'synthetic-test-device'}}
CAPS = {'profile_name': 'tv', 'platform_version': '6.5', 'architecture': '32'}
APPS = core.parse_apps("""
  'TV360' 'HJCS8hkoCO.TV360'
  'Hot IPTV' '6YLB5zo9te.HotIptv'
  'FPT Play' 'ZTpEFWgfa9.FPTPlay'
  'Nuvio TV' 'NuvioTV001.NuvioTV'
  'Nuvio EngineFS' 'NuvioTV001.EngineFsService'
  'Home' 'com.samsung.tv.csfs'
  'ArtApp' 'org.tizen.art-app'
""")


def snap():
    return core.snapshot('192.168.1.50', INFO, CAPS, copy.deepcopy(APPS), 'TEST-1')


def plan(s=None, remove=None):
    return core.make_plan(s or snap(), remove or ['HJCS8hkoCO'], ['ZTpEFWgfa9', 'NuvioTV001'], CATALOG)


class FakeDevice:
    def __init__(self, apps=None):
        self.inventory = copy.deepcopy(apps or APPS)
        self.writes = []
        self.information = copy.deepcopy(INFO)
        self.fail = None
        self.journal = None
        self.calls = 0

    def connect(self):
        pass

    def info(self):
        return self.information

    def capabilities(self):
        return CAPS

    def apps(self):
        return copy.deepcopy(self.inventory)

    def uninstall(self, package):
        if self.journal:
            saved = json.loads(self.journal.read_text())
            assert saved['steps'][-1]['status'] == 'pending'
            assert saved['steps'][-1]['package'] == package
        self.writes.append(package)
        if self.fail == 'exception':
            raise OSError('connection lost')
        if self.fail == 'no-op':
            return 'ok'
        self.inventory = [app for app in self.inventory if app['id'].split('.')[0] != package]
        if self.fail == 'collateral':
            self.inventory = [app for app in self.inventory if app['id'] != 'org.tizen.art-app']
        return 'ok'


class ParserTests(unittest.TestCase):
    def test_capabilities_split_at_first_colon(self):
        self.assertEqual(core.parse_capabilities('noise\narch:32\npath:a:b'), {'arch': '32', 'path': 'a:b'})

    def test_inventory_names_are_data_not_commands(self):
        apps = core.parse_apps("'$(evil)' 'test.safe'\n'$(evil)' 'test.safe'")
        self.assertEqual(apps, [{'id': 'test.safe', 'name': '$(evil)'}])

    def test_inventory_errors(self):
        for text in ('closed', "'A' 'bad; reboot'", "'A' 'test.app'\n'B' 'test.app'"):
            with self.subTest(text=text), self.assertRaises(core.Refused):
                core.parse_apps(text)

    def test_target_restrictions(self):
        for host in ('8.8.8.8', '127.0.0.1', '0.0.0.0', '224.0.0.1', '192.168.1.2;whoami', 'example.com', '::1'):
            with self.subTest(host=host), self.assertRaises(ValueError):
                core.endpoint(host)
        self.assertEqual(core.endpoint('192.168.1.50'), '192.168.1.50')

    def test_device_identity_required(self):
        for info in ({}, {'device': {'OS': 'Android', 'duid': 'abc', 'modelName': 'test'}}):
            with self.assertRaises(core.Refused):
                core.fingerprint(info)


class PlanTests(unittest.TestCase):
    def test_plan_is_explicit_and_carries_manual_recovery(self):
        value = plan()
        self.assertEqual(value['remove'][0]['appIds'], ['HJCS8hkoCO.TV360'])
        self.assertFalse(value['remove'][0]['automaticRestore'])
        self.assertTrue(value['artModeRequired'])
        self.assertIn('data', value['warning'])
        core.check_plan(value, snap(), CATALOG)

    def test_unknown_and_platform_apps_blocked(self):
        for package in ('org.tizen.art-app', 'com.samsung.tv.csfs', 'adplatform', 'ZODRT12q2l', 'unknown123', 'HJCS8hkoCO;reboot'):
            with self.subTest(package=package), self.assertRaises(core.Refused):
                core.make_plan(snap(), [package], [], CATALOG)

    def test_no_default_removal(self):
        with self.assertRaises(core.Refused):
            core.make_plan(snap(), [], [], CATALOG)

    def test_typo_in_retained_package_blocks_plan(self):
        with self.assertRaises(core.Refused):
            core.make_plan(snap(), ['HJCS8hkoCO'], ['NuvioTYPO1'], CATALOG)

    def test_post_restart_inventory_verification(self):
        value = plan()
        remaining = [app for app in APPS if app['id'] != 'HJCS8hkoCO.TV360']
        result = core.verify_plan_state(value, snap(), remaining, CATALOG)
        self.assertTrue(result['inventoryMatchesPlan'])
        self.assertEqual(result['physicalPlaybackAndArtMode'], 'not-tested-by-inventory')
        with self.assertRaises(core.Refused):
            core.verify_plan_state(value, snap(), APPS, CATALOG)
        with self.assertRaises(core.Refused):
            core.verify_plan_state(value, snap(), remaining[:-1], CATALOG)

    def test_retained_service_protects_whole_package(self):
        for keep in ('HJCS8hkoCO', 'HJCS8hkoCO.TV360'):
            with self.assertRaises(core.Refused):
                core.make_plan(snap(), ['HJCS8hkoCO'], [keep], CATALOG)

    def test_new_service_in_known_package_blocks_removal(self):
        value = snap()
        value['apps'].append({'id': 'HJCS8hkoCO.NewService', 'name': 'Unreviewed service'})
        with self.assertRaises(core.Refused):
            plan(value)

    def test_snapshot_and_plan_tampering(self):
        for key in ('host', 'fingerprint', 'model', 'firmware'):
            value = plan()
            value['device'][key] = 'changed'
            with self.subTest(key=key), self.assertRaises(core.Refused):
                core.check_plan(value, snap(), CATALOG)
        value = snap()
        value['apps'].append(value['apps'][0])
        with self.assertRaises(core.Refused):
            plan(value)

    def test_launcher_keeps_selected_order_and_escapes_manifest_name(self):
        config = core.launcher_config(snap(), ['ZTpEFWgfa9.FPTPlay', 'NuvioTV001.NuvioTV'], 'CyTizen001', '<unsafe & name>')
        self.assertEqual(config['apps'][0]['name'], 'FPT Play')
        from cyt.cli import widget_manifest
        import xml.etree.ElementTree as ET
        xml = ET.fromstring(widget_manifest(config))
        self.assertEqual(xml.find('{http://www.w3.org/ns/widgets}name').text, '<unsafe & name>')
        self.assertEqual(xml.find('{http://tizen.org/ns/widgets}application').get('required_version'), '6.5')
        self.assertNotIn('background-category', widget_manifest(config))

    def test_launcher_manifest_requests_only_the_reviewed_privileges(self):
        from cyt.cli import widget_manifest
        import xml.etree.ElementTree as ET
        config = core.launcher_config(snap(), ['ZTpEFWgfa9.FPTPlay'], 'CyTizen001', 'Test')
        xml = ET.fromstring(widget_manifest(config))
        names = sorted(item.get('name').rsplit('/', 1)[1] for item in xml.findall('{http://tizen.org/ns/widgets}privilege'))
        self.assertEqual(names, ['application.launch', 'network.get', 'tv.audiocontrol', 'tv.inputdevice', 'tv.window'])

    def test_unknown_stock_home_uses_exit_instead_of_guessed_id(self):
        value = snap()
        value['apps'] = [app for app in value['apps'] if app['id'] != 'com.samsung.tv.csfs']
        self.assertIsNone(core.launcher_config(value, ['ZTpEFWgfa9.FPTPlay'], 'CyTizen001', 'Test')['samsungHome'])

    def test_invalid_launcher_config(self):
        for apps, package in ((['missing.app'], 'CyTizen001'), ([], 'CyTizen001'),
                              (['ZTpEFWgfa9.FPTPlay'] * 2, 'CyTizen001'), (['ZTpEFWgfa9.FPTPlay'], '../../bad')):
            with self.assertRaises(core.Refused):
                core.launcher_config(snap(), apps, package, 'Test')


class ApplyTests(unittest.TestCase):
    def run_apply(self, device, path, value=None, confirmation=None, allow=True):
        value = value or plan()
        device.journal = path
        return apply_plan(device, snap(), value, CATALOG, path,
                          confirmation or value['confirmation'], allow)

    def test_success_durable_journal_and_no_unrelated_writes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'journal.json'
            device = FakeDevice()
            result = self.run_apply(device, path)
            self.assertEqual(device.writes, ['HJCS8hkoCO'])
            self.assertEqual(result['status'], 'verified')
            self.assertEqual(json.loads(path.read_text())['steps'][0]['status'], 'verified')

    def test_missing_consent_changes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            for confirmation, allow in (('bad', True), (None, False)):
                device = FakeDevice()
                with self.assertRaises(core.Refused):
                    self.run_apply(device, Path(directory) / 'j.json', confirmation=confirmation, allow=allow)
                self.assertFalse(device.writes)

    def test_wrong_tv_changes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            device = FakeDevice()
            device.information['device']['duid'] = 'another-device'
            with self.assertRaises(core.Refused):
                self.run_apply(device, Path(directory) / 'j.json')
            self.assertFalse(device.writes)

    def test_inventory_drift_changes_nothing(self):
        with tempfile.TemporaryDirectory() as directory:
            device = FakeDevice(APPS[:-1])
            with self.assertRaises(core.Refused):
                self.run_apply(device, Path(directory) / 'j.json')
            self.assertFalse(device.writes)

    def test_existing_journal_is_preserved(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'journal.json'
            path.write_text('ORIGINAL')
            device = FakeDevice()
            with self.assertRaises(FileExistsError):
                self.run_apply(device, path)
            self.assertEqual(path.read_text(), 'ORIGINAL')
            self.assertFalse(device.writes)

    def test_noop_collateral_and_connection_failure_stop_remaining_packages(self):
        for failure in ('no-op', 'collateral', 'exception'):
            with self.subTest(failure=failure), tempfile.TemporaryDirectory() as directory:
                path = Path(directory) / 'journal.json'
                device = FakeDevice()
                device.fail = failure
                value = plan(remove=['HJCS8hkoCO', '6YLB5zo9te'])
                with self.assertRaises((core.Refused, OSError)):
                    self.run_apply(device, path, value)
                self.assertEqual(len(device.writes), 1)
                self.assertEqual(json.loads(path.read_text())['status'], 'stopped')


class BuildTests(unittest.TestCase):
    def test_unsigned_build_is_refused_by_installer(self):
        config = core.launcher_config(snap(), ['ZTpEFWgfa9.FPTPlay'], 'CyTizen001', 'Test')
        with tempfile.TemporaryDirectory() as directory:
            widget = build(config, Path(directory) / 'stage')
            with zipfile.ZipFile(widget) as archive:
                self.assertIn('config.xml', archive.namelist())
                self.assertIn('index.html', archive.namelist())
                self.assertNotIn('author-signature.xml', archive.namelist())
            with self.assertRaises(core.Refused):
                check_signed_widget(widget, config)

    def test_source_tree_cannot_be_a_build_destination(self):
        with self.assertRaises(core.Refused):
            build({'package': 'CyTizen001', 'appId': 'CyTizen001.Home'}, ROOT / 'cyt')

    def test_backups_never_overwritten(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'snap.json'
            save_new(path, {'original': True})
            with self.assertRaises(FileExistsError):
                save_new(path, {'original': False})
            self.assertEqual(json.loads(path.read_text()), {'original': True})


if __name__ == '__main__':
    unittest.main()
