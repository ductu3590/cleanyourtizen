"""Pure parsers, plans and verification rules. No device access in this module."""
import hashlib
import ipaddress
import json
import re

SCHEMA = 1
ID = re.compile(r"^[A-Za-z0-9_][A-Za-z0-9_.-]{0,159}$")
PREFIXES = ('com.samsung.', 'org.tizen.', 'com.tizen.', 'org.volt.')


class Refused(ValueError):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'), ensure_ascii=False).encode()).hexdigest()


def endpoint(host):
    # Numeric IP only: never interpret user input as a command, URL or option.
    ip = ipaddress.ip_address(host)
    if not ip.is_private or ip.is_loopback or ip.is_unspecified or ip.is_multicast or ip.version != 4:
        raise Refused('Use the TV private LAN IPv4 address; public, loopback and multicast targets are refused')
    return str(ip)


def parse_capabilities(text):
    values = dict(line.strip().split(':', 1) for line in text.splitlines() if ':' in line)
    return {key.strip(): value.strip() for key, value in values.items()}


def parse_apps(text):
    apps = {}
    for name, app_id in re.findall(r"'([^']*)'\s+'([^']*)'", text):
        if not ID.fullmatch(app_id):
            raise Refused('Invalid App ID in device response')
        if app_id in apps and apps[app_id]['name'] != name:
            raise Refused('Conflicting duplicate App ID in device response')
        apps[app_id] = {'id': app_id, 'name': name}
    if not apps:
        raise Refused('No app inventory returned: no changes permitted')
    return sorted(apps.values(), key=lambda app: app['id'])


def fingerprint(info):
    device = info.get('device', {})
    identity = device.get('duid') or device.get('id')
    if not identity or device.get('OS', '').lower() != 'tizen' or not device.get('modelName'):
        raise Refused('TV did not provide a Tizen model and stable device identity')
    return hashlib.sha256(identity.encode()).hexdigest()


def snapshot(host, info, capabilities, apps, firmware='unknown'):
    if capabilities.get('profile_name') != 'tv':
        raise Refused('Connected SDB device is not a TV')
    return {'schema': SCHEMA, 'host': endpoint(host), 'fingerprint': fingerprint(info),
            'model': info['device']['modelName'], 'firmware': firmware,
            'firmwareSource': 'owner' if firmware != 'unknown' else 'unknown',
            'capabilities': capabilities, 'apps': apps}


def validate_snapshot(value):
    if value.get('schema') != SCHEMA or not re.fullmatch('[a-f0-9]{64}', value.get('fingerprint', '')):
        raise Refused('Invalid snapshot schema or fingerprint')
    endpoint(value['host'])
    apps = value.get('apps', [])
    if not apps or len({app['id'] for app in apps}) != len(apps):
        raise Refused('Missing or duplicate snapshot apps')
    if any(not ID.fullmatch(app['id']) for app in apps):
        raise Refused('Unsafe snapshot App ID')


def make_plan(snap, remove, keep, catalog):
    validate_snapshot(snap)
    remove, keep = sorted(set(remove)), sorted(set(keep))
    if not remove:
        raise Refused('Select at least one package explicitly; there is no default deletion list')
    if any(not ID.fullmatch(item) for item in remove + keep):
        raise Refused('Invalid package or App ID')
    keep_packages = {item.split('.')[0] for item in keep}
    known = {entry['package']: entry for entry in catalog['removable']}
    entries = []
    for package in remove:
        if package in keep_packages:
            raise Refused('Requested removal overlaps a retained app or one of its services')
        if package not in known or package in catalog['protectedPackages'] or package.startswith(PREFIXES):
            raise Refused('Unknown or protected package: ' + package)
        entry = known[package]
        members = sorted(app['id'] for app in snap['apps'] if app['id'].split('.')[0] == package)
        if not members or members != sorted(entry['appIds']):
            raise Refused('Package app/service membership differs from reviewed catalog: ' + package)
        entries.append({'package': package, 'name': entry['name'], 'appIds': members,
                        'reinstall': entry['reinstall'], 'automaticRestore': False})
    body = {'schema': SCHEMA, 'snapshotHash': digest(snap), 'device': {
        key: snap[key] for key in ('host', 'fingerprint', 'model', 'firmware')},
        'remove': entries, 'keep': keep, 'artModeRequired': True,
        'warning': 'Uninstall deletes app data. Inventory is not an APK/WGT backup. Store reinstall is manual, may be unavailable, and cannot recover credentials.'}
    return dict(body, confirmation=digest(body))


def check_plan(plan, snap, catalog):
    expected = make_plan(snap, [entry['package'] for entry in plan['remove']], plan['keep'], catalog)
    if plan != expected:
        raise Refused('Plan changed or no longer matches snapshot/catalog; generate and review a fresh plan')


def verify_inventory(before, after, removed):
    before_ids = {app['id'] for app in before}
    after_ids = {app['id'] for app in after}
    expected = {app for app in before_ids if app.split('.')[0] == removed}
    if not expected or after_ids != before_ids - expected:
        raise Refused('Uninstall verification failed: unexpected app drift, incomplete removal or unrelated changes')


def launcher_config(snap, preferred, package, name):
    validate_snapshot(snap)
    if not re.fullmatch('[A-Za-z0-9]{10}', package):
        raise Refused('Launcher package must contain exactly 10 alphanumeric characters')
    apps = {app['id']: app for app in snap['apps']}
    if not preferred or len(set(preferred)) != len(preferred):
        raise Refused('Choose a non-empty, unique app order')
    if any(app not in apps or app.split('.')[0] == package for app in preferred):
        raise Refused('Shortcut missing from inventory or points to launcher itself')
    return {'name': name, 'package': package, 'appId': package + '.Home', 'artModeRequired': True,
            'apps': [apps[app] for app in preferred],
            'samsungHome': 'com.samsung.tv.csfs' if 'com.samsung.tv.csfs' in apps else None}
