(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CytProbe = factory();
}(this, function () {
  'use strict';
  var TARGET_APPS = ['com.samsung.tv.coba.setting', 'org.tizen.SMSourceAPP',
    'com.samsung.tv.coba.setting.networksettings', 'org.tizen.hdmicec', 'org.tizen.homesetting', 'com.samsung.tv.csfs'];
  var APPCONTROL_APPS = ['com.samsung.tv.coba.setting', 'com.samsung.tv.coba.setting.networksettings', 'org.tizen.homesetting'];
  var PROPERTIES = ['VIDEOSOURCE', 'WIFI_NETWORK', 'NETWORK'];
  var USER_APPS = ['ZTpEFWgfa9.FPTPlay', 'IkWsFHtOY9.Stremio', '9Ur5IzDKqV.TizenYouTube', 'org.tizen.netflix-app'];

  function describe(error) { return String(error && (error.name || error.message) || error).slice(0, 120); }
  function names(object) {
    try { return Object.keys(object || {}).sort(); } catch (error) { return []; }
  }
  function safe(results, name, fn) {
    try { results.push({name: name, status: 'ok', detail: fn()}); }
    catch (error) { results.push({name: name, status: 'error', detail: describe(error)}); }
  }
  function methods(object) {
    var found = [], key;
    try {
      for (key in object) {
        try { if (typeof object[key] === 'function') found.push(key); } catch (error) { /* skip getter */ }
      }
    } catch (error) { return found; }
    return found.sort();
  }
  function nextIndex(count, index, key) {
    if (!count) return -1;
    if (key === 'ArrowRight' || key === 'ArrowDown') return Math.min(count - 1, index + 1);
    if (key === 'ArrowLeft' || key === 'ArrowUp') return Math.max(0, index - 1);
    return index;
  }
  function findSources(value) {
    var found = [];
    function walk(node, depth) {
      if (!node || typeof node !== 'object' || depth > 4) return;
      if (typeof node.type === 'string' && typeof node.number === 'number') { found.push(node); return; }
      var key;
      for (key in node) { try { walk(node[key], depth + 1); } catch (error) { /* skip */ } }
    }
    walk(value, 0);
    return found;
  }
  function sourceActions(sources) {
    return sources.map(function (source) {
      var name = source.editName ? ' "' + source.editName + '"' : '';
      return {kind: 'source', source: source, label: 'Hiện ' + source.type + ' ' + source.number + name};
    }).concat([{kind: 'hide', label: 'Tắt video nguồn'}]);
  }
  function actions() {
    var list = [{kind: 'windows', label: 'getAvailableWindows'}];
    USER_APPS.concat(['com.samsung.tv.csfs', 'org.tizen.SMSourceAPP']).forEach(function (id) {
      list.push({kind: 'launch', id: id, label: 'Mở ' + id});
    });
    APPCONTROL_APPS.forEach(function (id) { list.push({kind: 'appcontrol', id: id, label: 'AppControl ' + id}); });
    return list;
  }
  function perform(action, tizen, report) {
    function ok(text) { report('OK ' + action.label + (text ? ': ' + text : '')); }
    function fail(error) { report('LỖI ' + action.label + ': ' + describe(error) + ' ' + String(error && error.message || '').slice(0, 80)); }
    try {
      if (action.kind === 'source') {
        tizen.tvwindow.setSource(action.source, function () {
          if (typeof document !== 'undefined') document.documentElement.style.background = document.body.style.background = 'transparent';
          tizen.tvwindow.show(function () { ok('setSource + show'); }, fail, ['0px', '0px', '1920px', '1080px'], 'MAIN');
        }, fail);
      } else if (action.kind === 'hide') {
        tizen.tvwindow.hide(function () {
          if (typeof document !== 'undefined') document.documentElement.style.background = document.body.style.background = '';
          ok('hide');
        }, fail, 'MAIN');
      } else if (action.kind === 'windows') {
        tizen.tvwindow.getAvailableWindows(function (windows) { ok(JSON.stringify(windows)); }, fail);
      } else if (action.kind === 'appcontrol') {
        var control = new tizen.ApplicationControl('http://tizen.org/appcontrol/operation/default');
        tizen.application.launchAppControl(control, action.id, function () { ok(''); }, fail);
      } else {
        tizen.application.launch(action.id, function () { ok(''); }, fail);
      }
    } catch (error) { report('NGOẠI LỆ ' + action.label + ': ' + describe(error) + ' ' + String(error && error.message || '').slice(0, 80)); }
  }
  function sync(env) {
    var results = [], tizen = env.tizen, webapis = env.webapis;
    safe(results, 'webapis', function () { return webapis ? names(webapis).join(',') : 'missing'; });
    safe(results, 'b2bapis', function () { return env.b2bapis ? names(env.b2bapis).join(',') : 'missing'; });
    safe(results, 'tvinputdevice', function () { return tizen && tizen.tvinputdevice ? 'present' : 'missing'; });
    safe(results, 'supportedKeys', function () {
      if (!tizen || !tizen.tvinputdevice || !tizen.tvinputdevice.getSupportedKeys) return 'missing';
      var keys = tizen.tvinputdevice.getSupportedKeys();
      return keys.map(function (key) { return key.name; }).join(',');
    });
    [['tizen.tvwindow', tizen && tizen.tvwindow], ['tizen.tvdisplaycontrol', tizen && tizen.tvdisplaycontrol],
      ['tizen.tvaudiocontrol', tizen && tizen.tvaudiocontrol], ['tizen.tvinfo', tizen && tizen.tvinfo],
      ['webapis.tvinfo', webapis && webapis.tvinfo], ['webapis.unipicture', webapis && webapis.unipicture],
      ['webapis.productinfo', webapis && webapis.productinfo]].forEach(function (pair) {
      safe(results, pair[0] + '()', function () { return pair[1] ? methods(pair[1]).join(',') : 'missing'; });
    });
    return results;
  }
  function run(env, done) {
    var results = sync(env), pending = 0, tizen = env.tizen, registering = true, reported = false;
    function finish() {
      if (registering || pending !== 0 || reported) return;
      reported = true;
      done(results);
    }
    function probeAsync(name, start) {
      var settled = false;
      pending += 1;
      function settle(status, detail) {
        if (settled) return;
        settled = true;
        results.push({name: name, status: status, detail: detail});
        pending -= 1;
        finish();
      }
      try { start(function (v) { settle('ok', v); }, function (e) { settle('error', describe(e)); }); }
      catch (error) { settle('error', describe(error)); }
    }
    if (tizen && tizen.systeminfo) {
      PROPERTIES.forEach(function (property) {
        probeAsync('systeminfo.' + property, function (ok, fail) {
          tizen.systeminfo.getPropertyValue(property, function (value) {
            if (property === 'VIDEOSOURCE') { env.sources = findSources(value); }
            ok(JSON.stringify(value).slice(0, 700));
          }, fail);
        });
      });
    }
    if (tizen && tizen.application && tizen.application.getAppsInfo) {
      probeAsync('appsInfo', function (ok, fail) {
        tizen.application.getAppsInfo(function (list) {
          var ids = {};
          list.forEach(function (info) { ids[info.id] = true; });
          ok(TARGET_APPS.map(function (id) { return id + '=' + (ids[id] ? 'yes' : 'no'); }).join(' '));
        }, fail);
      });
    }
    if (tizen && tizen.tvwindow && tizen.tvwindow.getSource) {
      probeAsync('tvwindow.getSource', function (ok, fail) {
        var value = tizen.tvwindow.getSource();
        ok(JSON.stringify(value));
      });
    }
    registering = false;
    finish();
  }
  return {run: run, sync: sync, actions: actions, findSources: findSources, sourceActions: sourceActions, USER_APPS: USER_APPS, perform: perform, nextIndex: nextIndex, methods: methods, TARGET_APPS: TARGET_APPS, PROPERTIES: PROPERTIES};
}));
