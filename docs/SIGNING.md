# Create Samsung certificates and sign the launcher

Follow current official [Samsung certificate instructions](https://developer.samsung.com/smarttv/develop/getting-started/setting-up-sdk/creating-certificates.html).
Keep your account password and verification codes in Samsung's login window, not in chat or Git.

1. Install Samsung's official VS Code Tizen extension or the official Tizen SDK CLI installer.
   The Eclipse-based Tizen Studio IDE is retired; do not install it. Install the TV
   Extension and Samsung Certificate Extension. Developer Mode must whitelist the computer's LAN IP.
2. Connect the TV using Device Manager/SDB. Use the extension's **Actions → Create Certificate**
   workflow. If the SDK provides the standalone Certificate Manager, create a **Samsung → TV** profile there.
3. Create a profile and an **author certificate**. Complete Samsung sign-in yourself. Save the author
   certificate and its password securely; keep it for future updates of the same application.
4. Create a **public-level distributor certificate** and include the connected TV's DUID through the
   device selector. DUID is not the model code or serial number. Do not publish it.
5. Permit application installation for the connected TV if Device Manager requests it.
6. Build a launcher staging directory with `python -m cyt build`. In the official CLI, package/sign
   that directory with the saved profile. Typical syntax (confirm using your installed `tizen help package`):

   ```sh
   tizen package -t wgt -s YOUR_PROFILE -o .local/signed -- dist/launcher-v1
   ```

7. Pass the resulting signed `.wgt` to `cyt install` with the matching private launcher JSON.
   The tool checks signature-file presence and manifest identity; Samsung's installer validates
   the actual certificate chain, target DUID and cryptographic signatures.

An unsigned ZIP is not a signed WGT. Do not rename it and attempt to bypass the certificate check.
Certificates and passwords are excluded from Git; do not weaken signature policy or use somebody
else's author identity. Report certificate/install errors instead of uninstalling existing apps blindly.

## Windows with the official VS Code extension

Samsung also documents its [extension certificate workflow](https://developer.samsung.com/smarttv/develop/tools/additional-tools/vscode/creating-certificates.html).
Use **Actions → Create Certificate**, configure author/distributor and the connected TV, then sign in.
Exact interface labels can change between SDK versions; use the current documentation and actual UI.
