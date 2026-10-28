# Installing on another TV, with your own apps

English · [Tiếng Việt](TV-KHAC.md)

The launcher is not tied to FPT Play, Stremio or Nuvio: you pick apps installed on your own TV (Prime Video, Disney+,
Spotify, local streaming apps...). This page covers what changes on another TV; the common steps (Developer Mode,
certificates, build, sign, install) are in the [step-by-step guide](GETTING-STARTED.md).

## 1. Every TV needs your own certificate

- A `.wgt` signed by someone else will not install: the distributor certificate lists each TV's **DUID**, and other TVs
  refuse it (`Invalid signature`). Create your own ([guide, step 4](GETTING-STARTED.md)).
- Several TVs at home: connect `sdb` to each TV while creating the distributor certificate and tick all of them.
  One signed file then installs on every ticked TV.
- Keep the same author certificate for all updates.

## 2. Find the App IDs you want

Run the read-only `inspect` (guide, step 5), then list apps with their names:

```bat
python -c "import json; [print(a['id'], '|', a['name']) for a in json.load(open('.local/before.json', encoding='utf-8'))['apps']]"
```

Append `| findstr /i prime` to filter by name.

- Store apps look like **10 characters, a dot, a name**, for example `9Ur5IzDKqV.TizenYouTube`. They are the same on
  every TV, but take them from your own inventory.
- Samsung's preinstalled apps look like `com.samsung.tv...` or `org.tizen...`.
- The listed name is sometimes internal. If unsure, try the ID with `cyt launch`.
- An app installed after the snapshot needs a fresh `inspect`.

## 3. Create the configuration

```bat
python -m cyt launcher-config --snapshot .local/before.json --apps APPID_1 APPID_2 APPID_3 --package MyHomeTv01 --out .local/launcher.json
```

- `--apps`: App IDs in display order. **Five looks best** (one row); 6-10 make two rows. The order can be changed on the TV
  in **Settings → Sắp xếp ứng dụng** (arrange apps).
- `--package`: your own ID of **exactly 10 letters or digits**. `CyTizen001` is a development default. Changing it later
  installs a separate app and loses the saved order and wallpaper choice.
- Then add the optional keys to `.local/launcher.json`: `inputs` (step 7), `greetingName`, `events` (step 10), `service` (step 11).

## 4. How tiles look

- FPT Play, Stremio, Nuvio, YouTube and Netflix have designed tiles (matched by app name).
- Other apps get a blue-grey tile with the **first two letters** in large type and the full name below.
- Names come from the TV. To shorten one, edit that app's `"name"` (never its `"id"`) in `.local/launcher.json` and rebuild.
- For a branded tile, add a line to `brand()` in `launcher/app.js` and a CSS class in `launcher/style.css`. Use type and
  colour only, never copied logos. Contributions welcome ([CONTRIBUTING](../CONTRIBUTING.md)).

## 5. The background service with your apps

Enable `"service": {"mode": "guard", "delayMs": 500}` as in [step 11](GETTING-STARTED.md).

- **Any app opened from the launcher** is followed by its App ID: never interrupted while you watch; Home inside it brings
  the launcher back.
- **Apps opened elsewhere** (from Samsung Home, cast from a phone) are left alone when they are store apps (10-character ID),
  YouTube or Netflix.
- **Samsung preinstalled apps opened elsewhere** (Samsung TV Plus, Gallery, the browser...) may be covered by the launcher after
  about half a second. Open them from the launcher instead, or use **Samsung Home ↗** in Settings (pauses the service for 10 minutes).
- **Art Mode** was verified only on The Frame QA55LS03B (2022); TVs that are not a Frame have none. On another Frame, test right away:
  press Power into Art Mode and wait 10 seconds. If the launcher covers Art Mode, set `"mode": "observe"`, reinstall and report
  the model and firmware (never IP/DUID).
- Run the *Guard service* section of the [acceptance checklist](ACCEPTANCE.md).

## 6. When your TV behaves differently

| Symptom | Meaning | What to do |
|---|---|---|
| `inspect` says `not a TV` or cannot connect | Not a Tizen TV, or Developer Mode is wrong | Repeat steps 1-3 |
| Installs, but the screen is blank | Possibly Tizen older than 6.5 (untested) | Not supported; report model and firmware |
| Input menu does not switch | The TV refuses source switching from apps | Remove `inputs`; use the Source key |
| Home never returns to the launcher in guard mode | `cpu/running` unreadable, or a different Samsung Home ID | Check `samsungHome` in `launcher.json`; report it |
| The launcher covers an app you are watching | A preinstalled app opened outside the launcher (section 5) | Open it from the launcher, or use Samsung Home ↗ |

To contribute a profile for a new TV, follow [profiles/qa55ls03b.json](../profiles/qa55ls03b.json): exact model, firmware and
what was tested. Never submit IP, MAC, DUID, certificates or screenshots of private content.
