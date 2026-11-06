// Pure decision logic for the background service; no Tizen calls, so it is unit-testable.
// On this Frame (Tizen 6.5) addAppStatusChangeListener never fires, so the launcher page reports
// its own visibility and the service decides, after a short delay, whether Samsung Home took over.
// Apps opened from the launcher are followed through the TV's CPU cgroups: Samsung Home moves into
// cpu/running when Home is pressed over an app, even when the app itself never reports `visible`.
'use strict';

// Fallback only, for when the TV gives no art status: apps that usually run only while The Frame shows
// Art Mode. Not reliable alone: on one QA55LS03B this process stays up all the time, Samsung Home included.
var ART_SIGNALS = ['com.samsung.tv.wifi-motion-service-app'];
// Shows the art. Pressing Power puts it in cpu/running before the launcher is hidden; it stays in the
// background under Samsung Home.
var ART_APP = 'org.tizen.art-app';

// Some store entries are shortcuts to a differently named runtime process. YouTube is the one seen on
// QA55LS03B: the launcher opens 9Ur5IzDKqV.TizenYouTube, but getAppsContext and cpu/running only show
// Samsung's Cobalt YouTube process. Without this alias the service drops the follow immediately.
var RUNTIME_ALIASES = {'9Ur5IzDKqV.TizenYouTube': ['com.samsung.tv.cobalt-yt']};

function runtimeIds(appId) {
  return [appId].concat(RUNTIME_ALIASES[appId] || []);
}

function decide(state) {
  if (state.powerState && state.powerState !== 'on') return 'tv-not-on';
  if (state.launcherVisible) return 'already-visible';
  if (state.otherVisible) return 'app-visible'; // e.g. YouTube cast from a phone
  if (state.artMode === true) return 'art-mode';
  if (state.artMode === false) return 'launch';
  var running = state.contexts || [];
  for (var index = 0; index < ART_SIGNALS.length; index += 1) {
    if (running.indexOf(ART_SIGNALS[index]) >= 0) return 'art-mode';
  }
  return 'launch';
}

// running: PIDs listed in /sys/fs/cgroup/cpu/running (null when unreadable); contexts: [{appId, id: pid}].
function isRunning(running, context) { return running.indexOf(String(context.id)) >= 0; }

// true, false, or null when the cgroup cannot be read.
function artInFront(contexts, running) {
  if (!running) return null;
  return contexts.some(function (context) { return context.appId === ART_APP && isRunning(running, context); });
}

// status: 'on', 'off' or null from the TV, which can miss its deadline while apps are switching.
// Returns null when neither source can tell.
function artMode(status, inFront) {
  if (status === 'on' || inFront === true) return true;
  return status === 'off' || inFront === false ? false : null;
}

// The value of a get_artmode_status reply on the art channel, or null for any other message.
function parseArtStatus(text) {
  try {
    var message = JSON.parse(text);
    if (message.event !== 'd2d_service_message') return null;
    var data = JSON.parse(message.data);
    return data.event === 'get_artmode_status' && (data.value === 'on' || data.value === 'off') ? data.value : null;
  } catch (error) { return null; }
}

// What the followed app and Samsung Home are doing; null when the cgroup cannot be read.
function frontOf(contexts, running, appId, homeId) {
  if (!running) return null;
  var state = {home: false, app: 'gone'}, ids = runtimeIds(appId);
  contexts.forEach(function (context) {
    if (context.appId === homeId && isRunning(running, context)) state.home = true;
    if (ids.indexOf(context.appId) >= 0) state.app = isRunning(running, context) || state.app === 'running' ? 'running' : 'background';
  });
  return state;
}

// A media app in front (e.g. YouTube cast from a phone) means "leave it alone"; Samsung Home in front covers it.
// Returns the app ID, null when none, or undefined when the cgroup cannot be read.
function otherInFront(contexts, running, homeId, launcherId) {
  if (!running) return undefined;
  var own = launcherId.split('.')[0] + '.', found = null;
  for (var index = 0; index < contexts.length; index += 1) {
    var context = contexts[index], id = context.appId;
    if (!isRunning(running, context)) continue;
    if (id === homeId) return null;
    if (!found && id.indexOf(own) !== 0 && (/^[A-Za-z0-9]{10}\./.test(id) || /cobalt|netflix/.test(id))) found = id;
  }
  return found;
}

function createWatcher(options) {
  var now = options.now || Date.now, delayMs = options.delayMs || 2500;
  var pauseMs = options.pauseMs || 600000, awayMs = options.awayMs || 15000, cooldownMs = options.cooldownMs || 4000;
  var pollMs = options.pollMs || 1000, followStartMs = options.followStartMs || 30000;
  var pausedUntil = 0, awayUntil = 0, lastLaunch = -Infinity, pending = null, follow = null;
  var report = options.report || function () {};
  function cancel() { if (pending !== null) { options.clearTimer(pending); pending = null; } }
  function stopFollow() {
    if (follow && follow.timer !== null) options.clearTimer(follow.timer);
    follow = null;
  }
  function check(appId) {
    pending = null;
    if (now() < pausedUntil) { report('skip', 'paused'); return; }
    if (now() - lastLaunch < cooldownMs) { report('skip', 'cooldown'); return; }
    options.inspect(function (state) {
      var verdict = options.mode === 'guard' ? decide(state) : 'observe-only';
      report('decision', {verdict: verdict, powerState: state.powerState, launcherVisible: state.launcherVisible,
        otherVisible: state.otherVisible, artMode: state.artMode});
      if (verdict === 'launch') { lastLaunch = now(); options.launch(options.launcherId); }
      // Art Mode can last hours: keep waiting for the app to come back instead of giving up after followStartMs.
      else if (appId && (verdict === 'art-mode' || verdict === 'tv-not-on')) startFollow(appId, true);
    });
  }
  function schedule(appId) { cancel(); pending = options.setTimer(function () { check(appId); }, delayMs); }
  function startFollow(id, patient) {
    // seen: the app showed up in the contexts. A slow app can take seconds to get there after opened-app.
    var current = follow = {id: id, since: patient ? Infinity : now(), seen: !!patient, timer: null};
    current.timer = options.setTimer(function () { tick(current); }, pollMs);
  }
  // Polls what is in front while a launched app runs; Samsung Home in front means Home was pressed.
  function tick(current) {
    current.timer = null;
    options.front(current.id, function (front) {
      if (follow !== current) return; // stopped or replaced while the request was in flight
      if (front && front.home) { stopFollow(); report('app-left', current.id); schedule(current.id); return; }
      var starting = front && front.app === 'gone' && !current.seen;
      if ((front && front.app === 'gone' && current.seen) || ((!front || starting) && now() - current.since > followStartMs)) {
        stopFollow(); report('follow-stopped', current.id); return;
      }
      if (front && !starting) { current.seen = true; current.since = Math.max(current.since, now()); } // known state: keep following
      current.timer = options.setTimer(function () { tick(current); }, pollMs);
    });
  }
  return {
    command: function (name, argument) {
      var time = now();
      if (name === 'pause') { cancel(); stopFollow(); pausedUntil = time + pauseMs; }
      else if (name === 'resume' || name === 'ui-visible') { cancel(); stopFollow(); pausedUntil = 0; awayUntil = 0; }
      else if (name === 'opened-app') {
        cancel(); stopFollow(); awayUntil = time + awayMs;
        if (!argument || !options.front) return 'away';
        startFollow(argument);
        return 'following';
      }
      else if (name === 'ui-hidden') {
        cancel();
        if (time < pausedUntil) return 'paused';
        if (time < awayUntil || follow) return 'away'; // the launcher itself opened an app
        schedule();
        return 'scheduled';
      }
      return 'noted';
    }
  };
}

// Returns [command, argument] from the launcher's app control data.
function readCommand(appControl) {
  var data = (appControl && appControl.data) || [];
  for (var index = 0; index < data.length; index += 1) {
    var value = data[index].value;
    if (data[index].key === 'cmd' && value && value.length) return [String(value[0]), value.length > 1 ? String(value[1]) : ''];
  }
  return ['', ''];
}

module.exports = {createWatcher: createWatcher, decide: decide, readCommand: readCommand, frontOf: frontOf,
  artInFront: artInFront, artMode: artMode, parseArtStatus: parseArtStatus, otherInFront: otherInFront, runtimeIds: runtimeIds, RUNTIME_ALIASES: RUNTIME_ALIASES, ART_SIGNALS: ART_SIGNALS};
