// Desktop preview only. `cyt launcher-config` generates private shortcuts from a real TV inventory.
window.CYT_CONFIG = {
  name: 'CleanYourTizen', package: 'CyTizen001', appId: 'CyTizen001.Home',
  artModeRequired: true, samsungHome: 'com.samsung.tv.csfs',
  inputs: [{type: 'HDMI', number: 4, dock: true, label: 'PlayStation 4'}],
  apps: [
    {id: 'preview.fpt', name: 'FPT Play'}, {id: 'preview.stremio', name: 'Stremio'},
    {id: 'preview.nuvio', name: 'Nuvio TV'}, {id: 'preview.youtube', name: 'YouTube'},
    {id: 'preview.netflix', name: 'Netflix'}
  ],
  // Preview-only stand-in for tizen.application.getAppsInfo(); `cyt build` writes its own config.js without it.
  previewLibrary: [
    {id: 'preview.fpt', name: 'FPT Play'}, {id: 'preview.stremio', name: 'Stremio'}, {id: 'preview.nuvio', name: 'Nuvio TV'},
    {id: 'preview.youtube', name: 'YouTube'}, {id: 'preview.netflix', name: 'Netflix'}, {id: 'preview.vieon', name: 'VieON'},
    {id: 'preview.galaxy', name: 'Galaxy Play'}, {id: 'preview.spotify', name: 'Spotify'}, {id: 'preview.prime', name: 'Prime Video'},
    {id: 'preview.browser', name: 'Internet'}, {id: 'preview.gallery', name: 'Gallery'}, {id: 'preview.smartthings', name: 'SmartThings'},
    {id: 'preview.system', name: 'System Updater', show: false}, {id: 'com.samsung.tv.csfs', name: 'Samsung Home'}
  ]
};
