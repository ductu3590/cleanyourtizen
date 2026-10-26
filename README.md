# CleanYourTizen

A Samsung Tizen TV cleanup toolkit and an Apple TV-inspired standalone home app.
**v0.1: read-only discovery by default; no root, firmware edits, or system Home takeover.**

Inspired by the inspect → review → apply → verify workflow of
[CleanYourTV](https://github.com/Gathin23/cleanyourtv). This is an independent implementation;
Android `adb`, `pm disable-user` and APK launchers do not run on Tizen.
Not affiliated with Samsung or Apple. App names are their owners' trademarks; tile graphics are original typography.

## What works, and what is not promised

| Feature | v0.1 |
|---|---|
| Read model, capabilities and app inventory | Official SDB and local TV info endpoint |
| Preview selected app removal | Offline plan; no default deletion set |
| Uninstall reviewed user-facing packages | Explicit plan hash, data-loss acknowledgement, per-package verification |
| Restore removed app data | **Not possible from an inventory.** Manual store reinstall only |
| Standalone launcher | Tizen 6.5+ target, local HTML/CSS/JS, D-pad, ordered shortcuts, Samsung Home escape |
| Signed launcher installation | Requires your own Samsung certificates and signed WGT |
| Replace physical Home / auto-start | **Not implemented.** Separate firmware-specific research |
| Keep Art Mode | No Power/Home interception, no background auto-return; physical validation still required |
| Every Samsung TV | **Not claimed.** Tizen only, capability-driven, exact-device evidence |

Current device evidence is in [profiles/qa55ls03b.json](profiles/qa55ls03b.json).
An inventory result is not evidence that uninstall, signatures, remote keys or startup work.
Orsay TVs and commercial/hospitality displays are not covered by the initial profile.

## Requirements

- Python 3.10+ (standard library only), official Samsung/Tizen `sdb` on PATH or `--sdb /path/to/sdb`.
- TV and computer on a trusted LAN, TV Developer Mode enabled for the computer IP.
- Node 18+ for preview and JavaScript tests; no npm dependencies or install needed.
- To install the launcher: official Tizen SDK CLI or IDE extension, and your own Samsung author/distributor certificates.
  The retired Eclipse-based Tizen Studio IDE is not required or recommended.

Use Samsung's [device connection instructions](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/tv-device.html).
The repo does not download or redistribute Samsung binaries, signing keys or firmware.

## Inspect and plan (no TV changes)

Run at the repo root. `python` may be `python3` on Linux/macOS.

```sh
python -m cyt inspect --host 192.168.1.50 --firmware EXACT-FIRMWARE --out .local/before.json
python -m cyt plan --snapshot .local/before.json --remove HJCS8hkoCO --keep ZTpEFWgfa9 NuvioTV001 IkWsFHtOY9 --out .local/plan.json
```

The numeric IDs above are **examples, not a recommended deletion list**. Read the snapshot, choose
your own installed packages, check Samsung Apps in your region for reinstall availability, and
review every app/service belonging to each selected package. Unknown IDs and unexpected members
are blocked by [catalog/apps.json](catalog/apps.json). A package prefix shape alone is not proof
that an app is removable or safe.

The `firmware` field is explicitly owner-supplied when the network API cannot report it.
The fingerprint binds the plan to the TV, but this does not magically grant shell/root access.
SDB capabilities are observations, not promises that every supported-looking command works.

## Apply only after review

**Tizen uninstall is destructive.** It removes selected app data, including logins. A snapshot is
an inventory, not a binary/account backup. Store reinstall can be unavailable and cannot restore
login state. Retain paid activation information separately. Do not uninstall irreplaceable apps.

```sh
python -m cyt apply --snapshot .local/before.json --plan .local/plan.json --confirm FULL_HASH_PRINTED_IN_PLAN --allow-data-loss --journal .local/cleanup-journal.json
python -m cyt recovery --journal .local/cleanup-journal.json
python -m cyt verify --journal .local/cleanup-journal.json
```

`apply` checks the catalog, complete plan, TV fingerprint, capabilities and original app inventory.
It records intent **before** each uninstall, runs one package at a time, then checks that exactly the
expected App IDs disappeared and no unrelated app changed. An `ok` response alone never counts.
Any failure or drift stops the run; the journal remains. Existing snapshots/journals are never replaced.
There is no blind automatic retry or automatic factory reset. See [SAFETY](docs/SAFETY.md).
`verify` can be repeated after a user-controlled reboot; it checks exact app inventory, not playback or physical Art Mode.

## Launcher preview, build and install

```sh
npm run preview
# Open http://127.0.0.1:4173 and use arrows, Enter, Escape.
python -m cyt launcher-config --snapshot .local/before.json --apps ZTpEFWgfa9.FPTPlay IkWsFHtOY9.Stremio NuvioTV001.NuvioTV --out .local/launcher.json
python -m cyt build --config .local/launcher.json --out dist/launcher-v1
```

The build creates a staging directory and a deterministic **unsigned** WGT for inspection.
It is deliberately refused by `cyt install`. Sign the staging directory with Samsung's official
tools first: [certificate and signing guide](docs/SIGNING.md).

```sh
python -m cyt install --snapshot .local/before.json --config .local/launcher.json --widget .local/signed/launcher.wgt
python -m cyt launch --snapshot .local/before.json --config .local/launcher.json
python -m cyt home-status
```

Use a unique, stable 10-character alphanumeric package ID (`launcher-config --package`) and keep
the same author certificate for updates. Default `CyTizen001` is a development identity, not a
Samsung-approved production identity. Distribution to other owners requires their signing workflow.
The launcher is opened as a normal app. Physical Home continues to open Samsung Home.
Return/Escape opens the verified stock Home app, or exits the launcher when its identity is unknown.
No API calls target Art Mode, Home routing, system power or startup settings.

## Test and contribute

```sh
python -m unittest discover -s tests -v
npm test
```

Python tests cover wrong TV, inventory drift, missing consent, plan tampering, protected packages,
service membership, incomplete/collateral uninstall, connection failure and durable recovery records.
Node tests cover D-pad boundaries, stored order and failed launches. See [device acceptance](docs/ACCEPTANCE.md)
for the separate physical test checklist. Browser success does not establish on-TV compatibility.

New profiles must record exact model/firmware, command evidence and unknowns. Never submit tokens,
IP/MAC/DUID, credentials, certificates or screenshots of private content. Keep them in `.local/` or
`output/`, both excluded from Git. See [CONTRIBUTING](CONTRIBUTING.md).

## Research references

- [Samsung CLI](https://developer.samsung.com/smarttv/develop/getting-started/using-sdk/command-line-interface.html)
- [Samsung Application API](https://developer.samsung.com/smarttv/develop/api-references/tizen-web-device-api-references/application-api.html)
- [Community debloat findings](https://github.com/ardazeytin/samsung-tizen-tv-debloat): model-specific, no universal uninstall guarantee.
- [Arn0 native Home research](https://github.com/NelsonEU/arn0-tv/blob/main/docs/setup-tv.md): undocumented, exact-firmware guards, not enabled here.
- [CleanFrame experiment](https://github.com/nthnclrk/CleanFrame/blob/main/docs/agent-tv-setup-guide.md): The Frame Art Mode and startup need physical verification.

MIT licensed. No upstream implementation code is vendored.
