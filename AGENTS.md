# Working on CleanYourTizen

Read README.md and docs/SAFETY.md before operating a TV. Inspect/plan are read-only.
Never run arbitrary shell commands, root exploits, service menus or Home/startup writes.
The owner approved (2026-10-27) the opt-in guard service that reopens the launcher over Samsung Home.
It may only read TV state and launch the launcher; keep its Art Mode/standby/pause/cooldown checks.
An owner-approved plan is required for uninstall. Keep all services belonging to retained apps.
Preserve Samsung Home, Art Mode, platform services, networking, DRM and account infrastructure.
Backups are inventories, not copies of application binaries or credentials. Say so plainly.
Keep private device data, certificates and screenshots in ignored .local/ or output/ directories.
Do not claim support for all Samsung TVs; record evidence for the exact model and firmware.
For every source/config change: add appropriate tests, run related tests, and commit verified changes.
Never overwrite the owner's changes. Do not publish the repository without explicit authorization.
