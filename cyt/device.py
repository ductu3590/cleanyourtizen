"""Bounded official SDB operations. Never uses a host shell or arbitrary TV shell."""
import json
from pathlib import Path
import subprocess
import urllib.request
from .core import endpoint, parse_apps, parse_capabilities, Refused


class Device:
    def __init__(self, host, sdb='sdb'):
        self.host = endpoint(host)
        self.serial = self.host + ':26101'
        self.sdb = sdb

    def run(self, *args, timeout=25):
        result = subprocess.run([self.sdb, '-s', self.serial, *args], capture_output=True,
                                text=True, encoding='utf-8', errors='replace', timeout=timeout, shell=False)
        output = result.stdout + result.stderr
        if result.returncode != 0:
            raise Refused('SDB operation failed: ' + output[-2000:])
        return output

    def connect(self):
        result = subprocess.run([self.sdb, 'connect', self.serial], capture_output=True, text=True,
                                encoding='utf-8', errors='replace', timeout=15, shell=False)
        if result.returncode != 0:
            raise Refused('SDB connection failed: ' + result.stderr)

    def info(self):
        # Bypass host proxy configuration and refuse redirects away from the selected LAN TV.
        class NoRedirect(urllib.request.HTTPRedirectHandler):
            def redirect_request(self, req, fp, code, msg, headers, newurl):
                raise Refused('TV endpoint redirected; refusing another target')
        opener = urllib.request.build_opener(urllib.request.ProxyHandler({}), NoRedirect())
        with opener.open('http://' + self.host + ':8001/api/v2/', timeout=8) as response:
            return json.loads(response.read(1024 * 1024))

    def capabilities(self):
        return parse_capabilities(self.run('capability'))

    def apps(self):
        return parse_apps(self.run('shell', '0', 'applist'))

    def uninstall(self, package):
        # Caller must validate against catalog and fresh identity/inventory before EACH write.
        return self.run('uninstall', package, timeout=90)

    def install(self, widget):
        widget = Path(widget).resolve(strict=True)
        if widget.suffix.lower() != '.wgt':
            raise Refused('Only a signed .wgt widget can be installed')
        return self.run('install', str(widget), timeout=120)

    def launch(self, app_id):
        from .core import ID
        if not ID.fullmatch(app_id):
            raise Refused('Invalid launch App ID')
        return self.run('shell', '0', 'execute', app_id)
