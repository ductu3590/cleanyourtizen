// Tizen web service: brings the launcher back when Samsung Home covers it.
// Never registers Power/Home keys; Art Mode and standby are detected and left alone,
// and the launcher's "Samsung Home" button pauses the service.
'use strict';
var http = require('http');
var watch = require('./watch.js');
var settings = require('./config.json');
var watcher;

function report(event, detail) {
  if (!settings.reportUrl) return;
  try {
    var body = JSON.stringify({time: new Date().toISOString(), event: event, detail: detail === undefined ? null : detail});
    // url.parse + options object: older Tizen Node runtimes lack request(url, options).
    var target = require('url').parse(settings.reportUrl);
    var request = http.request({hostname: target.hostname, port: target.port, path: target.path,
      method: 'POST', headers: {'Content-Type': 'application/json'}});
    request.on('error', function () {});
    request.end(body);
  } catch (error) { /* reporting is diagnostic only */ }
}

// The TV's local REST API (same one phone remotes use); any failure yields null.
function localJson(path, done) {
  var finished = false;
  function finish(value) { if (!finished) { finished = true; done(value); } }
  try {
    var request = http.get({hostname: '127.0.0.1', port: 8001, path: path, timeout: 1500}, function (response) {
      var body = '';
      response.on('data', function (chunk) { body += chunk; });
      response.on('end', function () { try { finish(JSON.parse(body)); } catch (error) { finish(null); } });
    });
    request.on('timeout', function () { request.abort(); finish(null); });
    request.on('error', function () { finish(null); });
  } catch (error) { finish(null); }
}

// Store apps (10-character package prefix) report visibility through the REST API; Samsung system apps do not.
function anyVisible(ids, done) {
  if (!ids.length) { done(null); return; }
  localJson('/api/v2/applications/' + ids[0], function (app) {
    if (app && app.visible) done(ids[0]); else anyVisible(ids.slice(1), done);
  });
}

function inspect(done) {
  localJson('/api/v2/', function (info) {
    localJson('/api/v2/applications/' + settings.launcherId, function (launcher) {
      var state = {powerState: info && info.device ? info.device.PowerState : null,
        launcherVisible: !!(launcher && launcher.visible), contexts: [], otherVisible: null};
      function withContexts(contexts) {
        state.contexts = contexts.map(function (context) { return context.appId; });
        var own = settings.launcherId.split('.')[0] + '.';
        var store = state.contexts.filter(function (id, index, all) {
          return /^[A-Za-z0-9]{10}\./.test(id) && id.indexOf(own) !== 0 && all.indexOf(id) === index;
        });
        anyVisible(store, function (visible) { state.otherVisible = visible; done(state); });
      }
      try { tizen.application.getAppsContext(withContexts, function () { done(state); }); }
      catch (error) { done(state); }
    });
  });
}

function launch(id) {
  tizen.application.launch(id, function () { report('launch-ok', id); },
    function (error) { report('launch-failed', {id: id, error: error && error.message}); });
}

function isVisible(id, done) {
  localJson('/api/v2/applications/' + id, function (app) { done(!!(app && app.visible)); });
}

// Diagnostic builds only: when does the Art Mode signal appear after the launcher/app is covered?
function timeline(label) {
  var started = Date.now(), samples = [];
  function sample() {
    try {
      tizen.application.getAppsContext(function (contexts) {
        var ids = contexts.map(function (context) { return context.appId; });
        samples.push([Date.now() - started, watch.decide({powerState: 'on', contexts: ids})]);
        if (Date.now() - started < 4000) setTimeout(sample, 150); else report('timeline', {label: label, samples: samples});
      }, function () {});
    } catch (error) { /* diagnostic only */ }
  }
  sample();
}

// Diagnostic builds only: what changes when Home covers an app that does not report `visible`?
function trace(id) {
  var started = Date.now(), previous = null;
  function sample() {
    localJson('/api/v2/applications/' + id, function (app) {
      try {
        tizen.application.getAppsContext(function (contexts) {
          var ids = contexts.map(function (context) { return context.appId + '#' + context.id; });
          var detail = {t: Date.now() - started, rest: app && {running: app.running, visible: app.visible}};
          if (previous) {
            detail.added = ids.filter(function (x) { return previous.indexOf(x) < 0; });
            detail.removed = previous.filter(function (x) { return ids.indexOf(x) < 0; });
          } else detail.all = ids;
          previous = ids;
          report('trace', detail);
          if (Date.now() - started < 90000) setTimeout(sample, 1000);
        }, function () {});
      } catch (error) { /* diagnostic only */ }
    });
  }
  sample();
}

module.exports.onStart = function () {
  watcher = watch.createWatcher({mode: settings.mode, launcherId: settings.launcherId, delayMs: settings.delayMs,
    pauseMs: settings.pauseMs, cooldownMs: settings.cooldownMs, inspect: inspect, launch: launch, isVisible: isVisible,
    report: function (event, detail) { report(event, detail); if (event === 'app-left' && settings.reportUrl) timeline(event); },
    setTimer: setTimeout, clearTimer: clearTimeout});
  report('start', {mode: settings.mode, node: process.version});
};

module.exports.onRequest = function () {
  var command = ['', ''];
  try { command = watch.readCommand(tizen.application.getCurrentApplication().getRequestedAppControl().appControl); }
  catch (error) { report('request-failed', error && error.message); }
  if (!watcher) module.exports.onStart();
  report('request', {command: command, result: watcher.command(command[0], command[1])});
  if (command[0] === 'ui-hidden' && settings.reportUrl) timeline('ui-hidden');
  if (command[0] === 'opened-app' && command[1] && settings.reportUrl) trace(command[1]);
};

module.exports.onExit = function () { report('exit'); };
