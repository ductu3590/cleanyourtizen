// Desktop preview only. `cyt launcher-config` generates private shortcuts from a real TV inventory.
window.CYT_CONFIG = {
  name: 'CleanYourTizen', package: 'CyTizen001', appId: 'CyTizen001.Home',
  artModeRequired: true, samsungHome: 'com.samsung.tv.csfs',
  inputs: [{type: 'HDMI', number: 4}],
  apps: [
    {id: 'preview.fpt', name: 'FPT Play'}, {id: 'preview.stremio', name: 'Stremio'},
    {id: 'preview.nuvio', name: 'Nuvio TV'}, {id: 'preview.youtube', name: 'YouTube'},
    {id: 'preview.netflix', name: 'Netflix'}
  ]
};
