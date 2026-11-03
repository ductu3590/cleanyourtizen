// Live inputs: an opt-in live preview of an HDMI source inside its dock tile, and a quiet
// "device ready" hint when a dock input starts sending a signal. ES5 for the Tizen 6.5 browser.
//
// The TV video plane sits BEHIND the page. A preview therefore switches the TV's main source
// (so the device's audio plays, which is why it is opt-in with `preview: true`), shows the TV
// window at the tile's rectangle, and makes the page transparent exactly over the tile: html/body
// lose their background and a full-screen copy of the wallpaper with a hole cut at the tile takes
// their place. Every stop restores the opaque page synchronously, before the window is hidden.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CytInputsLive = factory();
}(this, function () {
  'use strict';
  var TV_WIDTH = 1920, TV_HEIGHT = 1080;
  var DWELL_MS = 900, POLL_MS = 5000, BANNER_MS = 8000, IDLE_MS = 10000, QUIET_MS = 10000, RETRY_MS = 60000;

  function finite(value) { return typeof value === 'number' && isFinite(value); }
  function isInput(tile) { return !!tile && tile.kind === 'input'; }

  // The TV window rectangle for a tile's on-screen box, as px strings like MAIN_RECT. The page is
  // laid out 1920 wide (meta viewport), so CSS px scale to TV px by 1920 / innerWidth. Clamped to
  // the screen and rounded to whole pixels; null when there is nothing sensible to show.
  function previewRect(box, innerWidth) {
    if (!box || !finite(box.left) || !finite(box.top) || !finite(box.width) || !finite(box.height)) return null;
    var scale = finite(innerWidth) && innerWidth > 0 ? TV_WIDTH / innerWidth : 1;
    var left = Math.max(0, Math.round(box.left * scale)), top = Math.max(0, Math.round(box.top * scale));
    var right = Math.min(TV_WIDTH, Math.round((box.left + box.width) * scale));
    var bottom = Math.min(TV_HEIGHT, Math.round((box.top + box.height) * scale));
    if (right - left < 2 || bottom - top < 2) return null;
    return [left + 'px', top + 'px', (right - left) + 'px', (bottom - top) + 'px'];
  }
  // The same rectangle back in CSS px, so the hole matches the TV window exactly.
  function rectBox(rect, innerWidth) {
    var scale = finite(innerWidth) && innerWidth > 0 ? innerWidth / TV_WIDTH : 1;
    var n = (rect || []).map(function (value) { return parseFloat(value); });
    if (n.length !== 4 || !n.every(finite)) return null;
    return {left: n[0] * scale, top: n[1] * scale, width: n[2] * scale, height: n[3] * scale};
  }
  function px(value) { return (Math.round(value * 100) / 100) + 'px'; }
  // clip-path for the backdrop: the whole viewport, then the tile's rounded rectangle wound the other
  // way. With evenodd the tile is a hole; the reverse winding makes it a hole under nonzero too, so a
  // browser that ignored the fill rule would still show the video. Corners are short polygon arcs
  // because clip-path: path() is newer than the Tizen 6.5 engine.
  function holePolygon(rect, viewport, steps) {
    var width = viewport.width, height = viewport.height;
    var x = rect.left, y = rect.top, w = rect.width, h = rect.height;
    var r = Math.max(0, Math.min(rect.radius || 0, w / 2, h / 2)), n = r > 0 ? (steps || 6) : 0;
    var points = [[0, 0], [width, 0], [width, height], [0, height], [0, 0]];
    var corners = [[x + r, y + r, 270], [x + r, y + h - r, 180], [x + w - r, y + h - r, 90], [x + w - r, y + r, 0]];
    var first = points.length;
    corners.forEach(function (corner) {
      for (var i = 0; i <= n; i += 1) {
        var angle = (corner[2] - 90 * (n ? i / n : 0)) * Math.PI / 180;
        points.push([corner[0] + r * Math.cos(angle), corner[1] + r * Math.sin(angle)]);
      }
    });
    points.push(points[first]);
    return 'polygon(evenodd, ' + points.map(function (point) { return px(point[0]) + ' ' + px(point[1]); }).join(', ') + ')';
  }
  // Opt-in per input: the first dock entry for the tile's source decides, like core.dockInputs.
  function previewEnabled(inputs, key) {
    var list = Array.isArray(inputs) ? inputs : [];
    for (var i = 0; i < list.length; i += 1) {
      var item = list[i];
      if (item && item.dock === true && item.type + ':' + item.number === key) return item.preview === true;
    }
    return false;
  }
  // A preview may start only on a connected, opted-in input tile while nothing else is on screen.
  function shouldPreview(tile, state) {
    var s = state || {};
    return isInput(tile) && tile.connected === true && !!tile.choice && !!tile.choice.source && s.enabled === true &&
      !s.menu && !s.picking && !s.library && !s.panel && !s.video && !s.hidden;
  }
  // Tiles whose signal went from false to true since the last read. Unknown (null) never counts,
  // and the first read after start or resume only sets the baseline.
  function readyTransitions(previous, tiles, firstRead) {
    if (firstRead) return [];
    var before = previous || {};
    return (Array.isArray(tiles) ? tiles : []).filter(function (tile) {
      return isInput(tile) && tile.connected === true && Object.prototype.hasOwnProperty.call(before, tile.id) && before[tile.id] === false;
    });
  }
  // The states to compare against next time: known values replace old ones, unknown keeps the last
  // known value, so a failed read in between does not hide a false -> true change.
  function nextStates(previous, tiles) {
    var out = Object.create(null), before = previous || {};
    Object.keys(before).forEach(function (id) { out[id] = before[id]; });
    (Array.isArray(tiles) ? tiles : []).forEach(function (tile) {
      if (isInput(tile) && typeof tile.connected === 'boolean') out[tile.id] = tile.connected;
    });
    return out;
  }

  // Browser controller. Options: tv, inputs, tiles(), button(id), state(), readSources(done),
  // refreshInputs(value), moveFocus(target, key), glyph(kind), deviceStyle(name), host (banner parent).
  function create(options) {
    var doc = options.document || document, win = options.window || window, tv = options.tv;
    var preview = null, dwell = null, poll = null, bannerTimer = null, bannerFade = null;
    var token = 0, released = 0, states = Object.create(null), firstRead = true;
    var quietUntil = 0, lastKeyAt = Date.now(), failed = Object.create(null), backdrop = null, banner = null;
    function noop() {}
    function current() {
      var s = options.state() || {};
      return {menu: !!s.menu, picking: !!s.picking, library: !!s.library, panel: !!s.panel, video: !!s.video, hidden: !!doc.hidden};
    }
    function inputsNow() { return typeof options.inputs === 'function' ? options.inputs() : options.inputs; }
    function blocked(s) { return s.menu || s.picking || s.library || s.panel || s.video || s.hidden; }
    function stateFor(tile) {
      var s = current(), when = failed[tile.key];
      s.enabled = previewEnabled(inputsNow(), tile.key) && !(when && Date.now() - when < RETRY_MS);
      return s;
    }
    function inputTiles() { return (options.tiles() || []).filter(isInput); }
    function hideWindow() {
      if (!tv || !tv.tvwindow || current().video) return; // never hide the full-screen video
      try { tv.tvwindow.hide(noop, noop, 'MAIN'); } catch (error) { /* nothing is shown over an opaque page */ }
    }

    // ---- The window in the page ----
    function ensureBackdrop() {
      if (backdrop && backdrop.parentNode) return backdrop;
      backdrop = doc.createElement('div'); backdrop.className = 'live-backdrop'; backdrop.setAttribute('aria-hidden', 'true');
      doc.body.insertBefore(backdrop, doc.body.firstChild);
      return backdrop;
    }
    function openWindow(p) {
      var box = rectBox(p.rect, win.innerWidth), layer = ensureBackdrop(), look = win.getComputedStyle(doc.body);
      // Copy what the body shows now (wallpaper or the default gradient) before it turns transparent.
      ['backgroundImage', 'backgroundSize', 'backgroundPosition', 'backgroundRepeat', 'backgroundColor'].forEach(function (name) {
        layer.style[name] = look[name];
      });
      box.radius = p.radius;
      doc.body.style.setProperty('--cyt-hole', holePolygon(box, {width: win.innerWidth, height: win.innerHeight}));
      doc.documentElement.classList.add('previewing'); doc.body.classList.add('previewing');
      p.button.classList.add('live');
    }
    function closeWindow(p) {
      doc.documentElement.classList.remove('previewing'); doc.body.classList.remove('previewing');
      doc.body.style.removeProperty('--cyt-hole');
      if (p && p.button) p.button.classList.remove('live');
    }

    // ---- Preview lifecycle ----
    function stop() {
      clearTimeout(dwell); dwell = null;
      if (!preview) return;
      var was = preview; preview = null;
      closeWindow(was); // the page is opaque again before the next frame
      quietUntil = Date.now() + QUIET_MS;
      if (was.phase !== 'switching') hideWindow();
    }
    function radiusOf(button, box) {
      var value = 0;
      try { value = parseFloat(win.getComputedStyle(button).borderTopLeftRadius) || 0; } catch (error) { value = 0; }
      return value * (button.offsetWidth ? box.width / button.offsetWidth : 1);
    }
    function start(tile, button) {
      if (preview || !tv || !tv.tvwindow || doc.activeElement !== button || !button.parentNode) return;
      if (!shouldPreview(tile, stateFor(tile))) return;
      var box = button.getBoundingClientRect(), rect = previewRect(box, win.innerWidth);
      if (!rect) return;
      var mine = token += 1;
      preview = {token: mine, tile: tile, button: button, rect: rect, radius: radiusOf(button, box), phase: 'switching'};
      quietUntil = Date.now() + QUIET_MS;
      function mineNow() { return !!preview && preview.token === mine; }
      function fail() { if (mineNow()) { failed[tile.key] = Date.now(); stop(); } }
      function shown() {
        if (!mineNow()) { if (mine !== released) hideWindow(); return; } // stopped while the TV was busy
        if (doc.activeElement !== button || !shouldPreview(tile, stateFor(tile))) { stop(); return; }
        preview.phase = 'live'; openWindow(preview);
      }
      try {
        tv.tvwindow.setSource(tile.choice.source, function () {
          if (!mineNow()) return; // stopped before the switch finished: nothing was shown
          preview.phase = 'showing';
          try { tv.tvwindow.show(shown, fail, rect, 'MAIN'); } catch (error) { fail(); }
        }, fail);
      } catch (error) { fail(); }
    }
    function arm(tile, button) {
      clearTimeout(dwell); dwell = null;
      if (!previewEnabled(inputsNow(), tile.key)) return;
      dwell = setTimeout(function () { dwell = null; start(tile, button); }, DWELL_MS);
    }
    function focusedTile() {
      var here = doc.activeElement;
      return inputTiles().filter(function (tile) { return here && options.button(tile.id) === here; })[0] || null;
    }
    function armFocused() {
      var tile = focusedTile();
      if (tile) arm(tile, options.button(tile.id));
    }

    // ---- Device ready ----
    function hideBanner(now) {
      clearTimeout(bannerTimer); clearTimeout(bannerFade); bannerTimer = bannerFade = null;
      if (!banner) return;
      banner.classList.remove('show');
      if (now) banner.hidden = true;
      else bannerFade = setTimeout(function () { banner.hidden = true; }, 400);
    }
    function showBanner(tile) {
      var host = options.host || doc.querySelector('.today') || doc.body;
      if (!banner) {
        banner = doc.createElement('p'); banner.className = 'ready-banner glass';
        banner.setAttribute('role', 'status'); banner.setAttribute('aria-live', 'polite'); banner.hidden = true;
        host.appendChild(banner);
      }
      clearTimeout(bannerTimer); clearTimeout(bannerFade);
      banner.textContent = '';
      var style = options.deviceStyle ? options.deviceStyle(tile.name) : 'console';
      if (options.glyph) banner.appendChild(options.glyph(style.indexOf('console') === 0 ? 'console' : 'device'));
      var text = doc.createElement('span'); text.textContent = tile.name + ' đã sẵn sàng'; banner.appendChild(text);
      banner.hidden = false;
      void banner.offsetWidth; // start the fade from the hidden state
      banner.classList.add('show');
      bannerTimer = setTimeout(function () { hideBanner(false); }, BANNER_MS);
    }
    function becameReady(tile) {
      showBanner(tile);
      var button = options.button(tile.id), s = current();
      // Only an idle remote moves focus, so a single OK plays; an active viewer is never interrupted.
      if (!button || blocked(s)) return;
      if (doc.activeElement === button) arm(tile, button); // already here: the preview may start now
      else if (Date.now() - lastKeyAt >= IDLE_MS) options.moveFocus(button, null);
    }
    // Called at the end of every refreshInputs: keep the live tile marked, stop a preview whose
    // source went away, and look for inputs that just became ready.
    function refreshed() {
      if (preview) {
        if (preview.tile.connected !== true || !preview.button.parentNode) stop();
        else if (preview.phase === 'live') preview.button.classList.add('live'); // drawInput resets the class
      }
      var list = inputTiles(), s = current();
      var ignore = !!preview || s.video || Date.now() < quietUntil; // our own setSource, or nobody would see it
      var ready = ignore ? [] : readyTransitions(states, list, firstRead);
      states = nextStates(states, list); firstRead = false;
      if (ready.length) becameReady(ready[0]);
    }
    function schedulePoll() {
      clearTimeout(poll); poll = null;
      if (doc.hidden || !tv || !tv.systeminfo || !inputTiles().length) return;
      poll = setTimeout(function () {
        poll = null;
        if (!current().video) options.readSources(options.refreshInputs);
        schedulePoll();
      }, POLL_MS);
    }

    // ---- Hooks called from app.js ----
    function focus(tile, button) {
      if (preview && preview.button !== button) stop();
      arm(tile, button);
    }
    function blur(button) {
      clearTimeout(dwell); dwell = null;
      if (preview && preview.button === button) stop();
    }
    // Our own switch to an input (full screen): hand the TV window over without hiding it, or a late
    // hide could land after the full-screen show. Ready hints stay quiet around it.
    function switching() {
      clearTimeout(dwell); dwell = null; quietUntil = Date.now() + QUIET_MS;
      if (!preview) return;
      var was = preview; preview = null; released = was.token; closeWindow(was);
    }
    function videoClosed() { quietUntil = Date.now() + QUIET_MS; armFocused(); }
    function visibility(visible) {
      if (!visible) { stop(); clearTimeout(poll); poll = null; hideBanner(true); return; }
      firstRead = true; lastKeyAt = Date.now(); schedulePoll();
    }
    // Any key but OK ends a preview (OK goes full screen through selectSource). Read-only: the key is
    // never prevented or registered, so Home, Power and Art Mode stay with the TV.
    doc.addEventListener('keydown', function (event) {
      lastKeyAt = Date.now();
      if (!preview || event.key === 'Enter' || event.keyCode === 13) return;
      stop();
      setTimeout(function () { if (!preview && !current().hidden) armFocused(); }, 0); // an edge press keeps focus here
    }, true);
    win.addEventListener('resize', stop);
    schedulePoll();
    return {focus: focus, blur: blur, stop: stop, switching: switching, videoClosed: videoClosed, refreshed: refreshed,
      visibility: visibility, previewing: function () { return !!preview && preview.phase === 'live'; }};
  }

  return {previewRect: previewRect, rectBox: rectBox, holePolygon: holePolygon, previewEnabled: previewEnabled,
    shouldPreview: shouldPreview, readyTransitions: readyTransitions, nextStates: nextStates, create: create,
    DWELL_MS: DWELL_MS, POLL_MS: POLL_MS, BANNER_MS: BANNER_MS, IDLE_MS: IDLE_MS, QUIET_MS: QUIET_MS};
}));
