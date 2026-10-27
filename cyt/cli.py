"""CLI entry point. Inspect/plan/config/build never mutate a TV."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import xml.etree.ElementTree as ET
import zipfile
from .core import (Refused, snapshot, make_plan, check_plan, fingerprint, digest,
                   verify_inventory, verify_plan_state, launcher_config)
from .device import Device

ROOT = Path(__file__).resolve().parents[1]


def read(path):
    return json.loads(Path(path).read_text(encoding='utf-8-sig'))


def save_new(path, data):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open('x', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.write('\n')


def checkpoint(path, data):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    with temporary.open('w', encoding='utf-8') as stream:
        json.dump(data, stream, ensure_ascii=False, indent=2)
        stream.flush()
        import os
        os.fsync(stream.fileno())
    temporary.replace(path)


def apply_plan(device, snap, plan, catalog, journal_path, confirmation, allow_data_loss):
    check_plan(plan, snap, catalog)
    if not allow_data_loss or confirmation != plan['confirmation']:
        raise Refused('Review the full plan, then pass its exact confirmation hash and --allow-data-loss')
    device.connect()
    if fingerprint(device.info()) != snap['fingerprint']:
        raise Refused('Different TV at this address; no changes made')
    caps = device.capabilities()
    for key in ('platform_version', 'architecture', 'profile_name'):
        if caps.get(key) != snap['capabilities'].get(key):
            raise Refused('Device capabilities changed; inspect again')
    current = device.apps()
    if digest(current) != digest(snap['apps']):
        raise Refused('Inventory changed since snapshot; inspect and plan again')
    journal = {'schema': 1, 'started': datetime.now(timezone.utc).isoformat(),
               'status': 'in-progress', 'snapshot': snap, 'plan': plan, 'steps': []}
    # Refuse an existing journal: a retry must never overwrite pre-change recovery data.
    save_new(journal_path, journal)
    try:
        for entry in plan['remove']:
            if fingerprint(device.info()) != snap['fingerprint']:
                raise Refused('Device identity changed during cleanup')
            fresh = device.apps()
            if digest(fresh) != digest(current):
                raise Refused('Unexpected inventory drift between packages')
            step = {'package': entry['package'], 'status': 'pending', 'before': current}
            journal['steps'].append(step)
            checkpoint(journal_path, journal)  # durable intent before the first uninstall call
            step['output'] = device.uninstall(entry['package'])[-4000:]
            after = device.apps()
            step['after'] = after
            verify_inventory(current, after, entry['package'])
            step['status'] = 'verified'
            checkpoint(journal_path, journal)
            current = after
        journal['status'] = 'verified'
        checkpoint(journal_path, journal)
    except Exception as error:
        journal['status'] = 'stopped'
        journal['error'] = str(error)
        checkpoint(journal_path, journal)
        raise
    return journal


SERVICE_MODES = ('observe', 'guard')


def service_settings(config):
    """Background service options. 'observe' only reports; 'guard' relaunches when Samsung Home covers the launcher."""
    import re
    service = config.get('service') or {}
    mode = service.get('mode', 'observe')
    if mode not in SERVICE_MODES:
        raise Refused('Service mode must be observe or guard')
    report = service.get('reportUrl')
    if report is not None and not re.fullmatch(r'http://(10|172|192)\.[0-9.]+:[0-9]{2,5}/[A-Za-z0-9/_-]*', report):
        raise Refused('Diagnostic report URL must be plain HTTP on a private LAN address')
    timing = {key: int(service.get(key, default)) for key, default in
              (('delayMs', 2500), ('pauseMs', 600000), ('cooldownMs', 4000))}
    # Below ~300 ms the Art Mode signal may not exist yet; see profiles/qa55ls03b.json.
    if not 300 <= timing['delayMs'] <= 30000 or timing['cooldownMs'] < 2000:
        raise Refused('Service timing would allow a relaunch loop')
    return dict(timing, mode=mode, launcherId=config['appId'], reportUrl=report)


def widget_manifest(config):
    import html
    name = html.escape(config['name'])
    service_settings(config)  # validate before emitting a manifest
    return f'''<?xml version="1.0" encoding="UTF-8"?>
<widget xmlns="http://www.w3.org/ns/widgets" xmlns:tizen="http://tizen.org/ns/widgets"
 id="https://cleanyourtizen.invalid/launcher" version="{config.get('version', '0.1.0')}" viewmodes="maximized">
 <tizen:application id="{config['appId']}" package="{config['package']}" required_version="6.5"/>
 <tizen:profile name="tv-samsung"/>
 <name>{name}</name><icon src="icon.png"/><content src="index.html"/>
 <feature name="http://tizen.org/feature/screen.size.all"/>
 <feature name="http://tizen.org/feature/web.service"/>
 <tizen:privilege name="http://tizen.org/privilege/application.launch"/>
 <!-- internet: the service reads the TV's own REST API on 127.0.0.1:8001 (power state, visibility). -->
 <tizen:privilege name="http://tizen.org/privilege/internet"/>
 <tizen:privilege name="http://tizen.org/privilege/tv.inputdevice"/>
 <tizen:privilege name="http://tizen.org/privilege/network.get"/>
 <tizen:privilege name="http://tizen.org/privilege/tv.window"/>
 <tizen:privilege name="http://tizen.org/privilege/tv.audiocontrol"/>
 <tizen:service id="{config['package']}.Service">
  <tizen:content src="service/service.js"/>
  <tizen:name>{name}Service</tizen:name>
  <tizen:description>Returns to the launcher when Samsung Home opens</tizen:description>
 </tizen:service>
 <tizen:setting screen-orientation="landscape" context-menu="disable" background-support="disable"/>
</widget>'''


WALLPAPER_NAME = r'[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\.(?:jpe?g|png)'
WALLPAPER_MAX_BYTES = 2_500_000
WALLPAPER_MAX_COUNT = 60


def collect_wallpapers(directory):
    import re
    directory = Path(directory)
    if not directory.is_dir():
        raise Refused('Wallpaper directory does not exist')
    files = sorted(item for item in directory.iterdir() if item.is_file())
    if not files:
        raise Refused('Wallpaper directory has no files')
    if len(files) > WALLPAPER_MAX_COUNT:
        raise Refused('Too many wallpapers; keep at most %d' % WALLPAPER_MAX_COUNT)
    for item in files:
        if not re.fullmatch(WALLPAPER_NAME, item.name, re.IGNORECASE):
            raise Refused('Wallpaper name must be 1-80 letters, digits, dot, dash or underscore ending in jpg or png: ' + item.name)
        if item.stat().st_size > WALLPAPER_MAX_BYTES:
            raise Refused('Wallpaper is larger than 2.5 MB; resize it to 1920x1080 first: ' + item.name)
    return files


def build(config, destination, wallpapers=None):
    import shutil
    import re
    if not re.fullmatch('[A-Za-z0-9]{10}', config.get('package', '')) or config.get('appId') != config['package'] + '.Home':
        raise Refused('Invalid launcher identity')
    destination = Path(destination).resolve()
    if destination.exists():
        raise Refused('Build destination exists; choose a fresh directory')
    if destination == ROOT or ROOT in destination.parents and destination.parts[len(ROOT.parts)] not in ('.local', 'dist', 'output'):
        raise Refused('Build into dist/, .local/, output/, or a directory outside the source tree')
    files = collect_wallpapers(wallpapers) if wallpapers else []
    settings = service_settings(config)
    config = dict(config)
    config.pop('wallpapers', None)
    if files:
        config['wallpapers'] = [item.name for item in files]
    destination.mkdir(parents=True)
    for source in (ROOT / 'launcher').iterdir():
        if source.is_file():
            shutil.copyfile(source, destination / source.name)
    if files:
        (destination / 'wallpapers').mkdir()
        for item in files:
            shutil.copyfile(item, destination / 'wallpapers' / item.name)
    (destination / 'service').mkdir()
    for name in ('service.js', 'watch.js'):
        shutil.copyfile(ROOT / 'launcher' / 'service' / name, destination / 'service' / name)
    (destination / 'service' / 'config.json').write_text(json.dumps(settings, indent=2) + '\n', encoding='utf-8')
    (destination / 'config.xml').write_text(widget_manifest(config), encoding='utf-8')
    page = {key: value for key, value in config.items() if key != 'service'}
    page['serviceId'] = config['package'] + '.Service'
    (destination / 'config.js').write_text('window.CYT_CONFIG = ' + json.dumps(page, ensure_ascii=True) + ';\n', encoding='utf-8')
    # Unsigned reproducible bundle for inspection, NOT something we pretend can be installed.
    widget = destination.parent / (destination.name + '-unsigned.wgt')
    if widget.exists():
        raise Refused('Unsigned artifact already exists; preserve it and use a fresh build name')
    with zipfile.ZipFile(widget, 'x', zipfile.ZIP_DEFLATED) as archive:
        for file in sorted(destination.rglob('*')):
            if file.is_file():
                name = file.relative_to(destination).as_posix()
                archive.writestr(zipfile.ZipInfo(name, (2020, 1, 1, 0, 0, 0)), file.read_bytes(), compress_type=zipfile.ZIP_DEFLATED)
    return widget


def install_and_verify(device, widget, config):
    """`sdb install` can push the file and exit 0 without installing it, so trust only the app inventory."""
    output = device.install(widget)
    if config['appId'] not in {app['id'] for app in device.apps()}:
        raise Refused('The widget was sent to the TV but ' + config['appId'] + ' is not installed. '
                      'Install the same signed .wgt with the official `tizen install -n NAME.wgt -s HOST:26101 -- DIR`, '
                      'then run `cyt launch`.')
    return output


def check_signed_widget(widget, config):
    with zipfile.ZipFile(widget) as archive:
        names = archive.namelist()
        if len(set(names)) != len(names) or any(name.startswith(('/', '\\')) or '..' in Path(name).parts or '\\' in name for name in names):
            raise Refused('Unsafe widget archive')
        if not {'config.xml', 'author-signature.xml', 'signature1.xml', 'index.html'} <= set(names):
            raise Refused('Widget is unsigned or incomplete; sign it with Samsung certificates first')
        manifest = ET.fromstring(archive.read('config.xml'))
        application = manifest.find('{http://tizen.org/ns/widgets}application')
        if application is None or application.get('id') != config['appId'] or application.get('package') != config['package']:
            raise Refused('Signed widget identity differs from reviewed launcher config')
    # Actual certificate validity and signatures are checked by Samsung's installer.


def parser():
    root = argparse.ArgumentParser(description='CleanYourTizen: read-only by default; no native Home modification')
    commands = root.add_subparsers(dest='command', required=True)
    inspect = commands.add_parser('inspect', help='Read identity, SDB capabilities and app inventory')
    inspect.add_argument('--host', required=True)
    inspect.add_argument('--sdb', default='sdb')
    inspect.add_argument('--firmware', default='unknown', help='Exact string read by owner from TV settings')
    inspect.add_argument('--out', required=True)
    plan = commands.add_parser('plan', help='Offline deletion preview only')
    plan.add_argument('--snapshot', required=True)
    plan.add_argument('--remove', nargs='+', required=True, help='Explicit package IDs from reviewed catalog')
    plan.add_argument('--keep', nargs='+', required=True, help='Retain package IDs or App IDs and their services')
    plan.add_argument('--out', required=True)
    apply = commands.add_parser('apply', help='Uninstall a reviewed plan; destroys selected app data')
    for option in ('snapshot', 'plan', 'confirm', 'journal'):
        apply.add_argument('--' + option, required=True)
    apply.add_argument('--sdb', default='sdb')
    apply.add_argument('--allow-data-loss', action='store_true')
    recovery = commands.add_parser('recovery', help='Show manual reinstall instructions; no TV writes')
    recovery.add_argument('--journal', required=True)
    verify = commands.add_parser('verify', help='Read current TV inventory and verify a previously applied journal')
    verify.add_argument('--journal', required=True)
    verify.add_argument('--sdb', default='sdb')
    config = commands.add_parser('launcher-config', help='Create private shortcut config from a real inventory')
    config.add_argument('--snapshot', required=True)
    config.add_argument('--apps', nargs='+', required=True)
    config.add_argument('--package', default='CyTizen001')
    config.add_argument('--name', default='CleanYourTizen')
    config.add_argument('--out', required=True)
    bundle = commands.add_parser('build', help='Build launcher staging directory and UNSIGNED widget')
    bundle.add_argument('--config', required=True)
    bundle.add_argument('--out', required=True)
    bundle.add_argument('--wallpapers', help='Directory of 1920x1080 jpg/png wallpapers; one is shown per day')
    for operation in ('install', 'launch'):
        sub = commands.add_parser(operation)
        sub.add_argument('--snapshot', required=True)
        sub.add_argument('--config', required=True)
        sub.add_argument('--sdb', default='sdb')
        if operation == 'install':
            sub.add_argument('--widget', required=True)
    commands.add_parser('home-status', help='Explain native Home and Art Mode support; never changes settings')
    return root


def main(argv=None):
    args = parser().parse_args(argv)
    catalog = read(ROOT / 'catalog/apps.json')
    if args.command == 'inspect':
        device = Device(args.host, args.sdb)
        device.connect()
        value = snapshot(args.host, device.info(), device.capabilities(), device.apps(), args.firmware)
        save_new(args.out, value)
        print(json.dumps({'model': value['model'], 'capabilities': value['capabilities'], 'appCount': len(value['apps']), 'saved': args.out}, indent=2))
    elif args.command == 'plan':
        value = make_plan(read(args.snapshot), args.remove, args.keep, catalog)
        save_new(args.out, value)
        print(json.dumps(value, indent=2, ensure_ascii=False))
    elif args.command == 'apply':
        snap, plan = read(args.snapshot), read(args.plan)
        result = apply_plan(Device(snap['host'], args.sdb), snap, plan, catalog,
                            args.journal, args.confirm, args.allow_data_loss)
        print('Verified uninstall of', len(result['steps']), 'packages. Journal:', args.journal)
    elif args.command == 'recovery':
        journal = read(args.journal)
        print('MANUAL REINSTALL ONLY. Data/logins cannot be restored from an inventory.')
        for entry in journal['plan']['remove']:
            print(entry['name'] + ': ' + entry['reinstall'])
    elif args.command == 'verify':
        journal = read(args.journal)
        snap, plan = journal['snapshot'], journal['plan']
        check_plan(plan, snap, catalog)
        if journal.get('status') != 'verified':
            raise Refused('Journal was stopped/incomplete; inspect manually before claiming acceptance')
        device = Device(snap['host'], args.sdb)
        device.connect()
        if fingerprint(device.info()) != snap['fingerprint']:
            raise Refused('Different TV; verification refused')
        print(json.dumps(verify_plan_state(plan, snap, device.apps(), catalog), indent=2))
    elif args.command == 'launcher-config':
        save_new(args.out, launcher_config(read(args.snapshot), args.apps, args.package, args.name))
        print('Saved private launcher config:', args.out)
    elif args.command == 'build':
        print('UNSIGNED, NOT INSTALLABLE:', build(read(args.config), args.out, args.wallpapers))
    elif args.command in ('install', 'launch'):
        snap, config = read(args.snapshot), read(args.config)
        from .core import validate_snapshot
        validate_snapshot(snap)
        device = Device(snap['host'], args.sdb)
        device.connect()
        if fingerprint(device.info()) != snap['fingerprint']:
            raise Refused('Wrong TV; operation refused')
        if args.command == 'install':
            check_signed_widget(args.widget, config)
            print(install_and_verify(device, args.widget, config))
        else:
            if config['appId'] not in {app['id'] for app in device.apps()}:
                raise Refused('Launcher is not installed')
            print(device.launch(config['appId']))
    elif args.command == 'home-status':
        print('UNSUPPORTED: no native Home/startup writer is shipped.\n'
              'Standalone launcher leaves Samsung Home and physical Power/Art Mode handling intact.\n'
              'Optional guard service (service.mode=guard) reopens the launcher when Samsung Home covers it; it changes no settings.\n'
              'Art Mode preservation after Home takeover requires a separately reviewed exact-firmware adapter and physical testing.\n'
              'No model is currently certified for native Home takeover by this repository.')


def entry():
    try:
        main()
    except (Refused, OSError, ValueError, KeyError, TypeError, zipfile.BadZipFile) as error:
        print('STOP:', error, file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    entry()
