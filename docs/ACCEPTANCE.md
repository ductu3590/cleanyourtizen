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
- [ ] Focus motion is smooth on the TV (no stutter when holding an arrow key); the focused tile is easy to spot from the sofa,
      also on dark tiles such as Netflix; an edge press nudges and settles.
- [ ] An input tile (`dock: true`) shows the TV's device name; its dot is green only while the device has a signal.
- [ ] OK on the input tile shows the input; Back returns focus to that tile; the input menu still works.
- [ ] The Ứng dụng tile lists installed apps from `getAppsInfo`; hidden system apps, the launcher and Samsung Home are absent.
- [ ] Record whether app icons load or the typographic fallback is shown.
- [ ] An app opened from the library is not interrupted by the guard service; Home inside it returns to the launcher.
- [ ] A pin or unpin from Sửa dock survives a launcher restart, keeps its place and leaves the input tile alone.
- [ ] Control center: ArrowUp from the dock focuses the button; OK slides the panel in smoothly; Back closes it and focuses the
      button; Back while an input is showing leaves the video first.
- [ ] In the panel, inputs switch the source; Left/Right on Âm lượng change the TV volume; Tắt tiếng toggles mute; Wi-Fi shows the
      real network and signal.
- [ ] Giới thiệu shows the exact model, firmware, Tizen version and resolution from systeminfo; record any "Không đọc được" in the
      device profile. Dịch vụ nền matches the build's `service.mode`; the built `config.js` has no `reportUrl`.
- [ ] Fresh install: setup appears once; Back on Chào mừng closes it without going to Samsung Home; a relaunch does not show it.
- [ ] Setup step 2 lists installed apps (no Samsung Home, no launcher) with the dock apps ticked; the dock then shows exactly the
      selection. Step 3 lists HDMI 1–4 with the TV's names and a dot for the connected one; Nguồn vào still lists every source.
- [ ] Setup step 4: record whether OK on the field opens the on-screen keyboard, whether accented Vietnamese is typed correctly,
      and whether Back closes the keyboard or steps back. The name appears in the greeting.
- [ ] With `screensaverMinutes: 1`, idle 1 minute: the screensaver fades in; OK and Back only wake it. No screensaver over HDMI.
- [ ] Idle beyond the TV's own screen saver and auto power off times (Settings → General → Power and Energy Saving); record
      whether each still triggers. The launcher must not prevent either.
- [ ] Between 22:00 and 06:00 the home is warm and dimmed, HDMI video is not; Chế độ đêm → Tắt removes it and survives a restart.
- [ ] With a bright and a dark wallpaper, clock, greeting and dock stay readable; note any stutter from the screensaver motion.
- [ ] With the PS4 in rest mode, open the launcher and wake the PS4: within ~5 s "PlayStation 4 đã sẵn sàng" appears; after 10 s
      untouched, focus is on its tile. Record whether `VIDEOSOURCE` `connected` follows power or only the cable. No note on the
      first read after opening the launcher.
- [ ] With `preview: true` on HDMI 4 and the PS4 on, focus its tile 1 s: the live picture sits exactly inside the rounded tile.
      Record the rect, whether audio plays and whether it continues after moving away. Moving, opening the panel and Home make
      the launcher opaque at once; OK goes full screen; Back returns to the tile.
- [ ] Disconnected network/failed app launch leaves controls usable.
- [ ] On The Frame, physically press Power into Art Mode; test leaving Art Mode again.
- [ ] Native Art Mode image/brightness behavior remains normal. UI preview cannot prove this.
- [ ] Standby and unplugged boot are tested separately before claiming automatic startup.

## Guard service (`service.mode: guard`)

- [ ] Applist shows `<package>.Service` next to the launcher.
- [ ] Home pressed over the launcher reopens it within ~1 s.
- [ ] Power into Art Mode is not interrupted; Settings and Source menus stay open.
- [ ] An app opened from the launcher is not interrupted, also after several minutes.
- [ ] Home pressed inside an app opened from the launcher reopens the launcher; Power there still enters Art Mode.
- [ ] **Samsung Home ↗** and Back from the home screen stay on Samsung Home for the pause period.
- [ ] Input shown inside the launcher (HDMI) is not interrupted.
- [ ] Diagnostic builds (`reportUrl`) are replaced by a build without it.

No native Home/startup takeover is part of this release. If installation or physical tests have not run,
leave those profile fields `not-tested`, even when the desktop preview and build are successful.
