// Ambient layer of the launcher: screensaver, night mode and wallpaper-aware contrast.
// It only changes this page. It never touches power, standby, Art Mode or the TV's own screen saver, and it never
// keeps the TV awake: the TV's screen saver and auto power off keep working as Samsung configured them.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CytAmbient = api;
}(this, function () {
  'use strict';
  var DEFAULT_MINUTES = 5, SLIDE_MS = 40000, CLOCK_MOVE_MINUTES = 3, CLOCK_FADE_MS = 800, HIDE_MS = 400;
  var KEN_BURNS = ['kb-a', 'kb-b', 'kb-c', 'kb-d'];
  var NIGHT_FROM = 22, NIGHT_TO = 6, CONTRAST_THRESHOLD = 0.45;
  // Where the white text sits on the 1920x1080 home screen, as fractions of the screen.
  var REGIONS = {
    clock: {x0: 0, x1: 0.35, y0: 0, y1: 0.32},
    greeting: {x0: 0.3, x1: 0.7, y0: 0, y1: 0.22},
    dock: {x0: 0, x1: 1, y0: 0.62, y1: 1}
  };
  var NAME = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,79}\.(jpe?g|png)$/i; // the same rule as CytCore.wallpaperFor

  // ---- Screensaver ----
  // Idle delay in ms from the optional `screensaverMinutes` page setting: default 5, 0 turns it off, else 1-60.
  function screensaverDelay(config) {
    var value = config ? config.screensaverMinutes : undefined;
    if (typeof value !== 'number' || !isFinite(value)) value = DEFAULT_MINUTES;
    if (value === 0) return 0;
    return Math.max(1, Math.min(60, Math.round(value))) * 60000;
  }
  function slideList(names) {
    var out = [];
    (Array.isArray(names) ? names : []).forEach(function (name) {
      if (typeof name === 'string' && NAME.test(name) && out.indexOf('wallpapers/' + name) < 0) out.push('wallpapers/' + name);
    });
    return out;
  }
  // The slide after `index`, wrapping; -1 when there is nothing to show.
  function nextSlide(names, index) {
    var count = Array.isArray(names) ? names.length : 0;
    if (!count) return -1;
    if (typeof index !== 'number' || index % 1 !== 0 || index < 0 || index >= count) return 0;
    return (index + 1) % count;
  }
  // Each slide pans the other way: four Ken Burns moves, used in turn.
  function kenBurnsClass(step) {
    var n = typeof step === 'number' && step % 1 === 0 ? step : 0;
    return KEN_BURNS[((n % KEN_BURNS.length) + KEN_BURNS.length) % KEN_BURNS.length];
  }
  // Clock corners, clockwise from the top left, so no pixel shows the same thing for long.
  function nextCorner(corner) { return typeof corner === 'number' && corner >= 0 && corner < 3 ? Math.floor(corner) + 1 : 0; }
  function clockText(date) { return ('0' + date.getHours()).slice(-2) + ':' + ('0' + date.getMinutes()).slice(-2); }

  // ---- Night mode ----
  function hour(value, fallback) { return typeof value === 'number' && value % 1 === 0 && value >= 0 && value <= 23 ? value : fallback; }
  // `night: false` (or null) turns it off; otherwise integer hours 0-23, each falling back to 22 and 6.
  function nightConfig(value) {
    if (value === false || value === null) return null;
    var source = value && typeof value === 'object' ? value : {};
    return {from: hour(source.from, NIGHT_FROM), to: hour(source.to, NIGHT_TO)};
  }
  // From `from` (inclusive) to `to` (exclusive) local hours; the range may wrap midnight. Equal hours never match.
  function isNight(date, night, preference) {
    if (preference === 'off' || !(date instanceof Date) || isNaN(date)) return false;
    var range = nightConfig(night);
    if (!range) return false;
    var now = date.getHours();
    if (range.from < range.to) return now >= range.from && now < range.to;
    if (range.from > range.to) return now >= range.from || now < range.to;
    return false;
  }
  function nightLabel(preference) { return preference === 'off' ? 'Tắt' : 'Tự động'; }

  // ---- Adaptive contrast ----
  function linear(channel) {
    var c = Math.max(0, Math.min(255, Number(channel) || 0)) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }
  // Relative luminance (sRGB to linear, Rec. 709 weights) of 0-255 channels, 0 to 1.
  function relativeLuminance(r, g, b) { return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b); }
  // Mean luminance of an RGBA pixel buffer inside a rectangle given as fractions; null when it covers no pixel.
  function regionLuminance(pixels, w, h, rect) {
    if (!pixels || !(w > 0) || !(h > 0) || !rect) return null;
    var x0 = Math.max(0, Math.floor(rect.x0 * w)), x1 = Math.min(w, Math.ceil(rect.x1 * w));
    var y0 = Math.max(0, Math.floor(rect.y0 * h)), y1 = Math.min(h, Math.ceil(rect.y1 * h));
    if (!(x1 > x0) || !(y1 > y0) || pixels.length < w * h * 4) return null;
    var sum = 0, count = 0;
    for (var y = y0; y < y1; y += 1) {
      for (var x = x0; x < x1; x += 1) {
        var at = (y * w + x) * 4;
        sum += relativeLuminance(pixels[at], pixels[at + 1], pixels[at + 2]); count += 1;
      }
    }
    return sum / count;
  }
  function measureRegions(pixels, w, h) {
    var out = {};
    Object.keys(REGIONS).forEach(function (name) { out[name] = regionLuminance(pixels, w, h, REGIONS[name]); });
    return out;
  }
  // Body classes for a measured wallpaper: bright behind the clock or greeting, or behind the dock.
  function contrastClasses(regions, threshold) {
    var limit = typeof threshold === 'number' ? threshold : CONTRAST_THRESHOLD, r = regions || {};
    function bright(value) { return typeof value === 'number' && value > limit; }
    return {'bright-top': bright(r.clock) || bright(r.greeting), 'bright-bottom': bright(r.dock)};
  }
  // The part of an image that `background-size: cover; background-position: center` shows on the screen.
  function coverRect(iw, ih, vw, vh) {
    if (!(iw > 0) || !(ih > 0)) return {sx: 0, sy: 0, sw: 0, sh: 0};
    if (!(vw > 0) || !(vh > 0)) return {sx: 0, sy: 0, sw: iw, sh: ih};
    var scale = Math.max(vw / iw, vh / ih), sw = Math.min(iw, vw / scale), sh = Math.min(ih, vh / scale);
    return {sx: (iw - sw) / 2, sy: (ih - sh) / 2, sw: sw, sh: sh};
  }

  // ---- Browser controller ----
  // options: {config, isVideo: function () -> true while an input is full screen, announce: function (text)}.
  function init(options) {
    var opts = options || {}, config = opts.config || {}, body = document.body;
    var isVideo = typeof opts.isVideo === 'function' ? opts.isVideo : function () { return false; };
    var announce = typeof opts.announce === 'function' ? opts.announce : function () {};
    var delay = screensaverDelay(config), slides = slideList(config.wallpapers), night = nightConfig(config.night);
    var preference = 'auto';
    try { preference = localStorage.getItem('cyt-night') === 'off' ? 'off' : 'auto'; } catch (error) { preference = 'auto'; }
    var idleTimer = null, slideTimer = null, clockTimer = null, hideTimer = null;
    var visible = !document.hidden, showing = false, holding = false;
    var current = null, cache = {}, pending = {}, layer = 0, slide = 0, move = 0, corner = 0, minutes = 0;

    function element(tag, name, parent) {
      var node = document.createElement(tag); node.className = name; node.setAttribute('aria-hidden', 'true');
      parent.appendChild(node); return node;
    }
    element('div', 'night-veil', body);
    var saver = element('div', 'saver', body); saver.hidden = true;
    var stage = element('div', 'saver-stage', saver);
    var layers = slides.length ? [element('div', 'saver-slide', stage), element('div', 'saver-slide', stage)] : [];
    if (!slides.length) element('div', 'saver-drift', stage);
    var face = element('p', 'saver-clock corner-0', saver);

    function setNight(date) { body.classList.toggle('night-mode', isNight(date, night, preference)); }
    function restartIdle() {
      clearTimeout(idleTimer); idleTimer = null;
      if (delay && visible) idleTimer = setTimeout(start, delay);
    }
    function resetLayers() {
      layers.forEach(function (node) {
        node.classList.remove('show'); KEN_BURNS.forEach(function (name) { node.classList.remove(name); });
      });
    }
    function showSlide() {
      var target = layers[layer], other = layers[1 - layer];
      target.style.backgroundImage = 'url("' + slides[slide] + '")';
      KEN_BURNS.forEach(function (name) { target.classList.remove(name); });
      void target.offsetWidth; // restart the slow move from scale(1)
      target.classList.add(kenBurnsClass(move)); move += 1;
      target.classList.add('show'); other.classList.remove('show');
      var next = nextSlide(slides, slide);
      if (next !== slide) { var preload = new Image(); preload.src = slides[next]; }
      slideTimer = setTimeout(function () {
        slideTimer = null; if (!showing) return;
        slide = nextSlide(slides, slide); layer = 1 - layer; showSlide();
      }, SLIDE_MS);
    }
    function showClock() {
      var now = new Date();
      face.textContent = clockText(now);
      clockTimer = setTimeout(stepClock, 60050 - (now.getSeconds() * 1000 + now.getMilliseconds()));
    }
    function stepClock() {
      clockTimer = null; if (!showing) return;
      minutes += 1;
      if (minutes % CLOCK_MOVE_MINUTES) { showClock(); return; }
      face.classList.add('fade');
      clockTimer = setTimeout(function () {
        clockTimer = null; if (!showing) return;
        corner = nextCorner(corner); face.className = 'saver-clock corner-' + corner; showClock();
      }, CLOCK_FADE_MS);
    }
    function start() {
      idleTimer = null;
      if (!visible || showing) return;
      if (isVideo()) { restartIdle(); return; } // never cover a console or set-top box picture
      showing = true; clearTimeout(hideTimer); hideTimer = null;
      setNight(new Date());
      corner = 0; minutes = 0; face.className = 'saver-clock corner-0'; showClock();
      if (layers.length) {
        resetLayers(); layer = 0;
        slide = Math.max(0, slides.indexOf(current)); // begin with the wallpaper already on screen
        showSlide(); // set while hidden, so the first slide does not fade a second time
      }
      saver.hidden = false; void saver.offsetWidth; saver.classList.add('on');
    }
    function finishHide() {
      clearTimeout(hideTimer); hideTimer = null;
      if (showing) return;
      saver.hidden = true; resetLayers();
    }
    function stop(now) {
      showing = false;
      clearTimeout(slideTimer); clearTimeout(clockTimer); slideTimer = null; clockTimer = null;
      saver.classList.remove('on');
      if (now) finishHide(); else { clearTimeout(hideTimer); hideTimer = setTimeout(finishHide, HIDE_MS); }
    }
    // True when the key only woke the screensaver: the launcher must then ignore it, Back included.
    function onKey(event) {
      setNight(new Date());
      if (showing) { stop(false); holding = true; restartIdle(); return true; }
      // A remote button held down to wake the screen repeats; those repeats are part of the wake press.
      if (holding && event && event.repeat) { restartIdle(); return true; }
      holding = false; restartIdle(); return false;
    }
    document.addEventListener('keyup', function () { holding = false; });
    function setVisible(on) {
      visible = !!on;
      if (!visible) { clearTimeout(idleTimer); idleTimer = null; if (showing) stop(true); else finishHide(); return; }
      setNight(new Date()); restartIdle();
    }

    function applyContrast(result) {
      if (!result) return;
      Object.keys(result).forEach(function (name) { body.classList.toggle(name, result[name]); });
    }
    function measure(image) {
      try {
        var w = 64, h = 36, canvas = document.createElement('canvas');
        canvas.width = w; canvas.height = h;
        var context = canvas.getContext('2d');
        var crop = coverRect(image.naturalWidth || image.width, image.naturalHeight || image.height,
          window.innerWidth || 1920, window.innerHeight || 1080);
        context.drawImage(image, crop.sx, crop.sy, crop.sw, crop.sh, 0, 0, w, h);
        return contrastClasses(measureRegions(context.getImageData(0, 0, w, h).data, w, h), CONTRAST_THRESHOLD);
      } catch (error) { return null; } // tainted or unreadable canvas: leave the classes as they are
    }
    // Measured once per URL; the picker preview calls this on every focus.
    function wallpaperChanged(url) {
      current = url;
      if (!url) return;
      if (Object.prototype.hasOwnProperty.call(cache, url)) { applyContrast(cache[url]); return; }
      if (pending[url]) return;
      pending[url] = true;
      var image = new Image();
      image.addEventListener('load', function () {
        delete pending[url]; cache[url] = measure(image);
        if (current === url) applyContrast(cache[url]);
      });
      image.addEventListener('error', function () { delete pending[url]; cache[url] = null; });
      image.src = url;
    }
    function toggleNight() {
      preference = preference === 'off' ? 'auto' : 'off';
      try { localStorage.setItem('cyt-night', preference); }
      catch (error) { announce('Không lưu được chế độ đêm. Lựa chọn chỉ có hiệu lực trong phiên này.'); }
      setNight(new Date());
      return nightLabel(preference);
    }

    setNight(new Date()); restartIdle();
    return {
      onKey: onKey, visible: setVisible, wallpaperChanged: wallpaperChanged, toggleNight: toggleNight,
      tick: function (date) { setNight(date instanceof Date ? date : new Date()); },
      nightLabel: function () { return nightLabel(preference); },
      nightAllowed: function () { return night !== null; },
      showing: function () { return showing; }
    };
  }

  return {screensaverDelay: screensaverDelay, slideList: slideList, nextSlide: nextSlide, kenBurnsClass: kenBurnsClass,
    nextCorner: nextCorner, clockText: clockText, nightConfig: nightConfig, isNight: isNight, nightLabel: nightLabel,
    relativeLuminance: relativeLuminance, regionLuminance: regionLuminance, measureRegions: measureRegions,
    contrastClasses: contrastClasses, coverRect: coverRect, REGIONS: REGIONS, CONTRAST_THRESHOLD: CONTRAST_THRESHOLD,
    SLIDE_MS: SLIDE_MS, init: init};
}));
