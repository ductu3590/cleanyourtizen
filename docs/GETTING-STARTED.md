# Getting started: install the CleanYourTizen launcher

This guide takes a stock Samsung TV to a glass-style home screen running as a normal app. Every command runs on a
Windows PC on the same network as the TV (tested on Windows 11 with a The Frame QA55LS03BAKXXV, Tizen 6.5).
Vietnamese version: [HUONG-DAN.md](HUONG-DAN.md).

> The launcher is an ordinary app. It does not modify firmware, needs no root and does not touch Art Mode.
> To remove it, uninstall the app. Samsung Home stays the TV's real home screen.
> It **cannot** replace the Home key, the Power key or the Disney+/VieON hotkeys; see [limits](#limits).

## 0. Requirements

- Samsung TV on Tizen 6.5 or newer. Older Tizen, Orsay and commercial displays are not covered.
- Windows PC on the same LAN, a Samsung account, Python 3.10+ (standard library only), Git.
- Node 18+ is optional, for `npm test` and `npm run preview`.

## 1. Enable Developer Mode on the TV

1. Press **Home** and open **Apps**.
2. Press **1 2 3 4 5** on the remote. Switch **Developer mode** to **On**.
3. Enter the PC's IP address (`ipconfig`) as **Host PC IP**, confirm, then restart the TV.

Keep the TV and PC on your home network. Never forward these ports to the Internet.

## 2. Install Samsung's tools

1. Install **Tizen Studio** from the official [Tizen download page](https://developer.tizen.org/development/tizen-studio/download)
   (default `C:\tizen-studio`). If a **CLI** installer is offered, choose it. You do not need the IDE, only Package Manager and the command-line tools.
2. Run `C:\tizen-studio\package-manager\package-manager.exe` as administrator and install:
   **Main SDK → Tizen SDK Tools → Certificate Manager**, **Extension SDK → Samsung Certificate Extension** and **TV Extensions**.
3. Add `C:\tizen-studio\tools` (`sdb.exe`) and `C:\tizen-studio\tools\ide\bin` (`tizen.bat`) to `PATH`, or use full paths.

## 3. Connect

```bat
sdb connect 192.168.1.50
sdb devices
```

You should see your TV model with state `device`.

## 4. Create Samsung certificates (once)

1. Open `C:\tizen-studio\tools\certificate-manager\certificate-manager.exe`, press **+**, choose **Samsung → TV**, name the profile.
2. Create an **author certificate** with a password and keep a safe copy. You need the same one for every update.
3. Sign in to your Samsung account in the window that opens. Never share your password or verification codes.
4. Create a **public distributor certificate**. In the device step, select the **connected TV** so its **DUID** is included.
   **Do not enter an IP address.** A certificate without the DUID fails at install time with `Invalid signature`.
   You can also paste the output of `sdb shell 0 getduid`. Do not publish your DUID.

Never commit or share the `SamsungCertificate` folder.

## 5. Get the code and inspect the TV (read-only)

```bat
git clone https://github.com/ductu3590/cleanyourtizen.git
cd cleanyourtizen
python -m cyt inspect --host 192.168.1.50 --firmware YOUR-FIRMWARE --out .local/before.json --sdb "C:/tizen-studio/tools/sdb.exe"
```

The firmware string is supplied by you (Settings → Support → About This TV). The snapshot lists installed apps; find the App IDs
you want in `.local/before.json`. The `.local/` folder is ignored by Git.

## 6. Optional: clean up apps

Read [SAFETY](SAFETY.md) first. Removing an app deletes its data and logins; reinstalling is manual. Many preinstalled apps refuse removal
with `can not uninstall app`. See "Apply only after review" in the [README](../README.md).

## 7. Configure the launcher

```bat
python -m cyt launcher-config --snapshot .local/before.json --apps ZTpEFWgfa9.FPTPlay 9Ur5IzDKqV.TizenYouTube org.tizen.netflix-app --out .local/launcher.json
```

Optionally add the inputs shown in the input menu to `.local/launcher.json`; the TV supplies the device names:

```json
"inputs": [{"type": "HDMI", "number": 4}]
```

## 8. Optional: daily wallpapers

Put `jpg`/`png` files (1920x1080 recommended, at most 2.5 MB each, at most 60, simple file names) into a folder such as `.local/wallpapers`
and pass `--wallpapers .local/wallpapers` when building. One wallpaper is used per day in file-name order. **Settings → Hình nền** previews
each one, saves a fixed choice, or returns to **automatic daily**. Only use images you may use; the repository ships none.

## 9. Build, sign, install

```bat
python -m cyt build --config .local/launcher.json --out dist/launcher-v1 --wallpapers .local/wallpapers
tizen package -t wgt -s YOUR_PROFILE -o .local/signed -- dist/launcher-v1
tizen install -n CleanYourTizen.wgt -s 192.168.1.50:26101 -- .local/signed
```

`build` makes an **unsigned** package that the TV refuses. `tizen package` signs it with your profile. `tizen install` performs the real install;
wait for `Tizen application is successfully installed.` Then open it from Apps or run
`python -m cyt launch --snapshot .local/before.json --config .local/launcher.json --sdb "C:/tizen-studio/tools/sdb.exe"`.

## 10. Optional: greeting, lunar date and family days

The home screen always shows a time-of-day greeting, the Vietnamese lunar date and a countdown to the nearest 2-3 holidays.
Optionally add to `.local/launcher.json`:

```json
"greetingName": "nhà An Bình",
"events": [
  {"name": "Sinh nhật Bi", "month": 10, "day": 29},
  {"name": "Giỗ ông", "month": 9, "day": 20, "lunar": true}
]
```

`greetingName` is appended to the greeting. `"lunar": true` marks a lunar date, converted every year. The countdown stays on
one line; the farthest event is dropped when it does not fit.

## 11. Optional: background service (return to launcher)

Every build includes a small service (`<package>.Service`). By default it only observes. To bring the launcher back after
Home, add this to `.local/launcher.json`, then build, sign and install again (step 9):

```json
"service": {"mode": "guard", "delayMs": 500}
```

- Home on the launcher: Samsung Home appears, the launcher reopens about half a second later.
- Home inside an app opened from the launcher (FPT Play, Stremio, Nuvio, YouTube, Netflix...): the launcher returns too.
- Apps you are watching are never interrupted, also after a long time; YouTube cast from a phone is left alone.
- Art Mode, standby and Samsung's Settings/Source menus are never interrupted.
- **Samsung Home ↗** in Settings, or Back on the home screen, pauses the service for 10 minutes.

The service only reads TV state (the local `127.0.0.1:8001` API and the `cpu/running` CPU cgroup) and launches the launcher.
It does not intercept Home or Power and changes no Home or startup setting. Removing the launcher removes the service.
To turn it off, set `"mode": "observe"` or delete the `service` line and reinstall. `reportUrl` is for debugging only.

## 12. Pin it to the front of Home

Home → Apps → the gear icon → choose **CleanYourTizen** → **Move** (or **Add to Home**) → place it first. Menu names vary by firmware.
Enable your TV's "resume last app on power on" setting (*Autorun Last App*), since the service cannot start at boot; on The Frame check that it does not disturb Art Mode.

## 13. Using it

![Home](images/launcher-home.png)

- **Top-right pill:** input switching (OK switches, Back returns), Wi-Fi name and signal, settings (volume, mute, wallpaper, arrange apps, Samsung Home).
- **App row:** OK opens an app. **Back** with no menu open goes to Samsung Home (and pauses the service for 10 minutes).
- **Top centre:** greeting, lunar date and holiday countdown.

![Input menu](images/launcher-input.png)
![Settings menu](images/launcher-settings.png)

## 14. Update and remove

- **Update:** rebuild, sign with the **same author certificate**, run `tizen install` again.
- **Remove:** `tizen uninstall -p CyTizen001.Home -s 192.168.1.50:26101`. Samsung Home is untouched.
- Turn Developer Mode off when you no longer need it.

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `sdb devices` shows no TV | Wrong PC IP in Developer Mode or TV not restarted | Repeat step 1 |
| `Invalid signature` on install | Distributor certificate has no DUID | Recreate it from a connected TV, reusing the author certificate |
| Install "succeeds" but the app is missing or old | `sdb install` only copies the file | Use `tizen install` |
| `Inventory changed since snapshot` | TV apps changed after the snapshot | Run `inspect` and `plan` again; never reuse an old plan |
| Package Manager fails | Needs administrator rights | Run it as administrator |
| `can not uninstall app` | Preinstalled system app | Cannot be removed in Developer Mode |
| Samsung Settings does not open | Platform blocks third-party launching of system apps (`UnknownError`) | Known limit |
| Wallpaper did not change | TV clock or timezone wrong, or no key pressed yet | Press any key; the date is rechecked |
| Home does not return to the launcher | Guard mode off, inside the 10-minute pause, or launcher not opened since power-on | Check the config, open the launcher once, wait for the pause |
| Old icon after updating | Samsung Home caches icons | Power-cycle the TV |

## Limits

- The service reopens the launcher only **after** Samsung Home appears (about half a second); it does not replace the Home key.
- No takeover of the Home key, Power key or brand hotkeys: they are not in the TV's supported-key list.
- No access to picture or sleep-timer settings, and Samsung's own settings apps cannot be opened from a normal app.
- Some preinstalled apps cannot be removed.
- Verified on one TV only; see the [device profile](../profiles/qa55ls03b.json). Other models and firmware may differ.

You are responsible for your own TV. This project is not affiliated with Samsung or Apple.
