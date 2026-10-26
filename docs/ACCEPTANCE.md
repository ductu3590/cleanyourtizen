# Device acceptance (record results; never assume)

Use exact model/firmware and a private session directory. These checks are separate from unit tests.

## Inspector and cleanup

- [ ] Inspect returns real model, Tizen version, architecture and non-empty App IDs.
- [ ] Snapshot is saved before writes and contains no raw DUID/MAC/account token.
- [ ] Plan includes only owner-approved apps; retained package services are excluded.
- [ ] Owner understands data loss; regional reinstall routes reviewed.
- [ ] Each package disappearance verified; no unrelated App IDs disappear or appear.
- [ ] Retained streaming apps still open and play; account/DRM/network still work.
- [ ] After a separately announced restart, take a fresh inventory and compare.
- [ ] No claim of reclaimed RAM/storage without actual measurement.

## Standalone launcher

- [ ] Signed widget installs; app identity matches the private configuration.
- [ ] D-pad reaches every tile and toolbar action; OK opens the selected installed app.
- [ ] Return provides escape to stock Home; physical Home still opens Samsung Home.
- [ ] Shortcut order survives a launcher restart.
- [ ] Disconnected network/failed app launch leaves controls usable.
- [ ] On The Frame, physically press Power into Art Mode; test leaving Art Mode again.
- [ ] Native Art Mode image/brightness behavior remains normal. UI preview cannot prove this.
- [ ] Standby and unplugged boot are tested separately before claiming automatic startup.

No Home/startup takeover is part of this release. If installation or physical tests have not run,
leave those profile fields `not-tested`, even when the desktop preview and build are successful.
