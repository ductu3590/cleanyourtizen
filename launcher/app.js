(function () {
  'use strict';
  var config = window.CYT_CONFIG, core = window.CytCore, calendar = window.CytCalendar, tv = window.tizen;
  var controls = window.CytControls;
  var $ = function (id) { return document.getElementById(id); };
  var dock = $('dock'), panel = $('panel'), message = $('message'), home = $('home');
  var menu = $('menu'), menuItems = $('menu-items'), caption = $('caption');
  // The control center button: the one control at the top right. Its panel (#menu) holds input, sound, Wi-Fi and settings.
  var centerButton = $('btn-controls');
  var MAIN_RECT = ['0px', '0px', '1920px', '1080px'];
  var timer, saved = [], openMenu = null, videoOn = false, clockTimer = null, picking = false, pickerBack = null;
  var subBack = null, slideTimer = null;
  var videoReturn = null, preference = 'auto';
  try { preference = localStorage.getItem('cyt-wallpaper') || 'auto'; } catch (error) { preference = 'auto'; }
  try { saved = JSON.parse(localStorage.getItem('cyt-order') || '[]'); } catch (error) { saved = []; }
  // Dock apps: the set pinned from the library on this TV, else the built-in shortcuts.
  var storedDock = null;
  try { storedDock = JSON.parse(localStorage.getItem('cyt-dock-apps') || 'null'); } catch (error) { storedDock = null; }
  var dockList = core.dockApps(config.apps || [], storedDock);
  // First-run setup (setup.js): inputs chosen on this TV replace the build's list when they are valid.
  var setup = window.CytSetup, inputsConfig = setup.storedInputs(config.inputs, setup.readJson('cyt-inputs'));
  // Dock tiles: those apps plus inputs pinned with `dock: true`, in the order saved on this TV.
  var tiles = core.orderApps(dockList.concat(core.dockInputs(inputsConfig, null)), saved);
  // Screensaver, night mode and wallpaper contrast. It never touches power, standby or Art Mode.
  var ambient = window.CytAmbient.init({config: config, isVideo: function () { return videoOn; }, announce: announce});

  function announce(text) {
    message.textContent = text; message.hidden = false;
    clearTimeout(timer); timer = setTimeout(function () { message.hidden = true; }, 6000);
  }
  function openApp(id) { core.launch(tv, id, function () {}, announce); }
  // Tell the background service the launcher is leaving on purpose before it gets hidden.
  function openShortcut(id) { core.tellService(tv, config.serviceId, 'opened-app', function () { openApp(id); }, id); }
  function hideVideo(done) {
    var finish = function () { if (done) done(); };
    if (!videoOn || !tv || !tv.tvwindow) { videoOn = false; finish(); return; }
    videoOn = false;
    try { tv.tvwindow.hide(finish, finish, 'MAIN'); } catch (error) { finish(); }
  }
  function returnHome() {
    hideVideo(function () {
      // Pause the background service first so it does not pull the launcher straight back.
      if (config.samsungHome) { core.tellService(tv, config.serviceId, 'pause', function () { openApp(config.samsungHome); }); return; }
      try { tv.application.getCurrentApplication().exit(); }
      catch (error) { announce('Bản xem trước · Thoát launcher'); }
    });
  }

  // ---- Clock, Wi-Fi ----
  var shownDay = null;
  function clock() {
    var now = new Date();
    $('time').textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    var hello = calendar.greeting(now, setup.storedGreeting(config.greetingName));
    $('greeting').textContent = hello.text;
    document.querySelector('.today').classList.toggle('night', hello.period === 'evening' || hello.period === 'night');
    if (shownDay === now.toDateString()) return;
    shownDay = now.toDateString();
    var lunar = calendar.toLunar(now.getDate(), now.getMonth() + 1, now.getFullYear());
    $('date').textContent = now.toLocaleDateString('vi-VN', {weekday: 'long', day: 'numeric', month: 'long'}) +
      '\u00a0\u00a0|\u00a0\u00a0Âm lịch: ' + lunar.day + '/' + lunar.month;
    // Show the nearest events, dropping the farthest until the line fits.
    var events = $('events'), line = events.parentNode, items = calendar.countdowns(now, config.events, 3);
    for (var count = items.length; count >= 1; count -= 1) {
      events.textContent = items.slice(0, count).join('\u00a0\u00a0\u00a0·\u00a0\u00a0\u00a0');
      if (line.scrollWidth <= line.clientWidth) break;
    }
    line.hidden = !items.length;
  }
  var wifi = core.wifiInfo(null);
  function readWifi(done) {
    if (!tv || !tv.systeminfo) { if (done) done(); return; }
    try {
      tv.systeminfo.getPropertyValue('WIFI_NETWORK', function (value) {
        wifi = core.wifiInfo(value); $('wifi-status').setAttribute('data-bars', String(wifi.bars)); if (done) done();
      }, function () { if (done) done(); });
    } catch (error) { if (done) done(); }
  }
  function readSources(done) {
    if (!tv || !tv.systeminfo) { done(null); return; }
    try { tv.systeminfo.getPropertyValue('VIDEOSOURCE', done, function () { done(null); }); }
    catch (error) { done(null); }
  }

  // ---- Audio ----
  function audio() { return tv && tv.tvaudiocontrol && tv.tvaudiocontrol.getVolume ? tv.tvaudiocontrol : null; }
  function volume() { try { return audio().getVolume(); } catch (error) { return null; } }
  function muted() { try { return !!audio().isMute(); } catch (error) { return false; } }

  // ---- Control center ----
  // One panel that slides in from the right (#menu). Its rows are built in buildControls(); About is a sub-view of it.
  var MAIN_HINT = 'OK để chọn  ·  Back để đóng';
  function row(label, value, onActivate, options) {
    var button = document.createElement('button'); button.className = 'row'; button.setAttribute('role', 'menuitem');
    var left = document.createElement('span');
    if (options && options.dot !== undefined) {
      var dot = document.createElement('i'); dot.className = 'dot' + (options.dot ? ' on' : ''); left.appendChild(dot);
    }
    left.appendChild(document.createTextNode(label));
    button.appendChild(left);
    var right = document.createElement('span'); right.className = 'value'; right.textContent = value || '';
    button.appendChild(right);
    if (options && options.adjust) button.setAttribute('data-adjust', options.adjust);
    // Information rows (Wi-Fi, About) still take focus, like every row, but nothing happens on OK.
    if (options && options.info) button.className += ' info';
    if (!onActivate) button.setAttribute('aria-disabled', 'true');
    else button.addEventListener('click', onActivate);
    button.addEventListener('focus', function () { keepVisible(button); });
    menuItems.appendChild(button);
    return {button: button, value: right};
  }
  // A quiet section label, a thin divider and a closing note. None of them takes focus.
  function heading(text) { var title = document.createElement('p'); title.className = 'row-heading'; title.textContent = text; menuItems.appendChild(title); }
  function divider() { var line = document.createElement('hr'); line.className = 'row-divider'; menuItems.appendChild(line); }
  function note(text) { var line = document.createElement('p'); line.className = 'row-note'; line.textContent = text; menuItems.appendChild(line); }
  function menuRows() { return Array.prototype.slice.call(menuItems.querySelectorAll('.row')); }
  // Scroll the row list itself (never the page), in case a TV shows more rows than fit.
  function keepVisible(button) {
    var top = button.offsetTop, bottom = top + button.offsetHeight;
    if (top < menuItems.scrollTop) menuItems.scrollTop = top;
    else if (bottom > menuItems.scrollTop + menuItems.clientHeight) menuItems.scrollTop = bottom - menuItems.clientHeight;
  }
  function slideMenu(open) {
    clearTimeout(slideTimer);
    if (open) { menu.hidden = false; void menu.offsetWidth; menu.classList.add('open'); return; }
    menu.classList.remove('open');
    // Hide after the slide-out, so the off-screen rows can never take focus.
    slideTimer = setTimeout(function () { if (!openMenu) menu.hidden = true; }, 450);
  }
  function setMenuOpen(name) {
    if (name) live.stop();
    var was = openMenu;
    openMenu = name; subBack = null;
    document.body.classList.toggle('menu-open', !!name);
    centerButton.classList.toggle('active', !!name);
    centerButton.setAttribute('aria-expanded', name ? 'true' : 'false');
    if (!name !== !was) slideMenu(!!name);
  }
  function closeMenu() {
    var name = openMenu; setMenuOpen(null);
    if (name) centerButton.focus();
  }
  function focusFirstRow() { var first = menuRows()[0]; if (first) first.focus(); }
  function enterRows() { menuItems.classList.remove('enter'); void menuItems.offsetWidth; menuItems.classList.add('enter'); }
  function showMenu(name, title, build) {
    menuItems.textContent = ''; menuItems.scrollTop = 0; menu.classList.remove('sub');
    $('menu-title').textContent = title; $('menu-hint').textContent = MAIN_HINT;
    build(); setMenuOpen(name); focusFirstRow();
  }
  // A view inside the panel, such as Giới thiệu. The panel rows wait aside; Back puts them back on the row that opened it.
  function openSubView(title, build) {
    var from = document.activeElement, rows = document.createDocumentFragment(), mainTitle = $('menu-title').textContent;
    while (menuItems.firstChild) rows.appendChild(menuItems.firstChild);
    $('menu-title').textContent = title; $('menu-hint').textContent = 'Back để quay lại'; menu.classList.add('sub');
    build(); menuItems.scrollTop = 0; enterRows(); focusFirstRow();
    subBack = function () {
      menuItems.textContent = ''; menuItems.appendChild(rows); menu.classList.remove('sub');
      $('menu-title').textContent = mainTitle; $('menu-hint').textContent = MAIN_HINT; enterRows();
      if (from && from.parentNode) from.focus(); else focusFirstRow();
    };
  }
  // Back inside the panel: leave a sub-view first, then close the panel and return to the control center button.
  function menuBack() {
    if (subBack) { var back = subBack; subBack = null; back(); return; }
    closeMenu();
  }
  function enterVideo(choice) {
    return function () {
      try {
        tv.tvwindow.show(function () {
          videoOn = true; setMenuOpen(null);
          document.documentElement.classList.add('video'); document.body.classList.add('video');
        }, function () { announce('Không hiển thị được ' + choice.title + '.'); }, MAIN_RECT, 'MAIN');
      } catch (error) { announce('TV chưa cho phép hiển thị nguồn này.'); }
    };
  }
  function selectSource(choice, returnTo) {
    live.switching();
    videoReturn = returnTo || null;
    if (!tv || !tv.tvwindow) { announce('Bản xem trước · ' + choice.title); return; }
    try { tv.tvwindow.setSource(choice.source, enterVideo(choice), function () { announce('Không chuyển được sang ' + choice.title + '.'); }); }
    catch (error) { announce('TV chưa cho phép chuyển nguồn này.'); }
  }
  function leaveVideo() {
    hideVideo(function () {
      document.documentElement.classList.remove('video'); document.body.classList.remove('video');
      var back = videoReturn && videoReturn.parentNode ? videoReturn : $('btn-controls');
      videoReturn = null; back.focus(); live.videoClosed();
    });
  }
  function buildInput(choices) {
    if (!choices.length) { row('Chưa có nguồn nào được chọn', '', null); return; }
    choices.forEach(function (choice) {
      row(choice.title, choice.name || (choice.connected ? 'Đang kết nối' : 'Không có tín hiệu'),
        function () { selectSource(choice); }, {dot: choice.connected});
    });
  }
  // Read the sources and Wi-Fi first, so the panel opens complete and focus lands once.
  function openControls() {
    readSources(function (value) {
      readWifi(function () { showMenu('controls', 'Điều khiển', function () { buildControls(value); }); });
    });
  }
  // Every row of the control center, top to bottom. Add a row with row(label, value, onActivate, options) where it belongs.
  function buildControls(value) {
    heading('Nguồn vào');
    buildInput(core.inputChoices(value, inputsConfig));
    divider();
    var current = volume();
    var volumeRow = row('Âm lượng', current === null ? 'Không điều khiển được' : '‹  ' + current + '  ›', null, {adjust: 'volume'});
    volumeRow.button.removeAttribute('aria-disabled');
    if (current === null) volumeRow.button.setAttribute('aria-disabled', 'true');
    var muteRow = row('Tắt tiếng', muted() ? 'Bật' : 'Tắt', function () {
      try { audio().setMute(!muted()); muteRow.value.textContent = muted() ? 'Bật' : 'Tắt'; }
      catch (error) { announce('Không điều khiển được âm thanh.'); }
    });
    divider();
    row('Wi-Fi', wifi.on ? wifi.ssid + '  ·  ' + wifi.percent + '%' : 'Đang tắt hoặc chưa kết nối', null, {info: true});
    divider();
    if ((config.wallpapers || []).length) {
      row('Hình nền', wallpaperName(preference) + '  ›', function () { setMenuOpen(null); openPicker(); });
    }
    if (ambient.nightAllowed()) {
      var nightRow = row('Chế độ đêm', ambient.nightLabel(), function () { nightRow.value.textContent = ambient.toggleNight(); });
    }
    row('Sắp xếp ứng dụng', '›', function () { setMenuOpen(null); openPanel(); });
    divider();
    row('Giới thiệu', '›', openAbout);
    row('Thiết lập lại', '›', function () { setMenuOpen(null); openSetup(); });
    row('Samsung Home', '↗', returnHome);
  }
  // Giới thiệu: read-only facts. TV values come from systeminfo; version and service mode from the built page config.
  function openAbout() {
    controls.readAbout(tv, function (system) {
      if (openMenu !== 'controls' || subBack) return; // the panel closed while the TV answered
      var apps = tiles.filter(function (tile) { return tile.kind !== 'input'; }).length;
      system.version = config.version; system.serviceMode = config.serviceMode;
      system.dockApps = apps; system.dockInputs = tiles.length - apps;
      openSubView('Giới thiệu', function () {
        controls.aboutRows(system).forEach(function (line) { row(line[0], line[1], null, {info: true}); });
        note(controls.NOTE);
      });
    }, 1500);
  }
  function adjustVolume(key, target) {
    var current = volume();
    if (current === null) return;
    var next = core.adjustVolume(current, key, 2);
    try { audio().setVolume(next); target.querySelector('.value').textContent = '‹  ' + next + '  ›'; }
    catch (error) { announce('Không chỉnh được âm lượng.'); }
  }

  // ---- Apps ----
  function brand(name) {
    var value = name.toLowerCase();
    if (value.indexOf('fpt') >= 0) return ['fpt', 'FPT', 'PLAY'];
    if (value.indexOf('stremio') >= 0) return ['stremio', 'S', 'stremio'];
    if (value.indexOf('nuvio') >= 0) return ['nuvio', 'N', 'NUVIO'];
    if (value.indexOf('youtube') >= 0) return ['youtube', '▶', 'YouTube'];
    if (value.indexOf('netflix') >= 0) return ['netflix', 'N', 'NETFLIX'];
    if (value.indexOf('galaxy') >= 0 || value.indexOf('fim+') >= 0) return ['galaxyplay', 'G', 'GALAXY PLAY'];
    if (value.indexOf('tv360') >= 0 || value.indexOf('tv 360') >= 0) return ['tv360', '360', 'TV360'];
    if (value.indexOf('multiscreen') >= 0 || value.indexOf('mutilscreen') >= 0 || value.indexOf('multi screen') >= 0 || value.indexOf('app launcher') >= 0) return ['multiscreen', '⧉', 'MULTISCREEN'];
    return ['generic', name.substring(0, 2).toUpperCase(), name];
  }
  var SVG = 'http://www.w3.org/2000/svg';
  var GLYPHS = {
    console: ['M7 8h10a4 4 0 0 1 3.9 3.1l1 4.6a2.6 2.6 0 0 1-4.5 2.2L15.5 16h-7l-1.9 1.9a2.6 2.6 0 0 1-4.5-2.2l1-4.6A4 4 0 0 1 7 8z',
      'M8 10.5v3M6.5 12h3', 'M15.5 11h.01M17.5 13h.01'],
    device: ['M10 7l5 5-5 5M15 12H3M14 4h5a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-5'],
    library: ['M4.5 4.5h5.5v5.5H4.5z', 'M14 4.5h5.5v5.5H14z', 'M4.5 14h5.5v5.5H4.5z', 'M14 14h5.5v5.5H14z']
  };
  function glyph(kind) {
    var icon = document.createElementNS(SVG, 'svg');
    icon.setAttribute('viewBox', '0 0 24 24'); icon.setAttribute('class', 'glyph'); icon.setAttribute('aria-hidden', 'true');
    GLYPHS[kind].forEach(function (shape) {
      var line = document.createElementNS(SVG, 'path'); line.setAttribute('d', shape); icon.appendChild(line);
    });
    return icon;
  }
  // An input tile: device glyph, the device name and a quiet "HDMI 4" badge whose dot shows the signal.
  function drawInput(tile, button) {
    var style = core.deviceStyle(tile.name);
    var state = tile.connected === true ? ', đang kết nối' : tile.connected === false ? ', không có tín hiệu' : '';
    button.className = 'app-tile input-tile ' + style + (tile.connected === false ? ' idle' : '');
    button.setAttribute('aria-label', tile.name + ', ' + tile.title + state);
    button.textContent = '';
    var badge = document.createElement('span'); badge.className = 'badge';
    var dot = document.createElement('i'); dot.className = 'dot' + (tile.connected === true ? ' on' : '');
    badge.appendChild(dot); badge.appendChild(document.createTextNode(tile.title));
    var label = document.createElement('span'); label.className = 'tile-label'; label.textContent = tile.name;
    button.appendChild(badge); button.appendChild(glyph(style.indexOf('console') === 0 ? 'console' : 'device'));
    button.appendChild(label);
  }
  function inputButton(id) {
    return Array.prototype.filter.call(dock.children, function (button) { return button.getAttribute('data-id') === id; })[0];
  }
  // Refresh names and signal from the TV without rebuilding the dock, so focus stays where it is.
  function refreshInputs(value) {
    core.dockInputs(inputsConfig, value).forEach(function (fresh) {
      var tile = tiles.filter(function (item) { return item.id === fresh.id; })[0];
      if (!tile) return;
      tile.name = fresh.name; tile.connected = fresh.connected; tile.choice = fresh.choice;
      var button = inputButton(tile.id);
      if (button) drawInput(tile, button);
    });
    live.refreshed();
  }
  function readInputs() {
    if (tiles.some(function (tile) { return tile.kind === 'input'; })) readSources(refreshInputs);
  }
  // Read the sources again on OK: the TV's source object is required, and the device may have just woken.
  function openInputTile(tile, button) {
    readSources(function (value) {
      refreshInputs(value);
      if (tile.choice) { selectSource(tile.choice, button); return; }
      announce(tv ? 'TV chưa báo nguồn ' + tile.title + '. Thử lại trong Điều khiển › Nguồn vào.' : 'Bản xem trước · ' + tile.name + ' (' + tile.title + ')');
    });
  }
  function render() {
    dock.textContent = '';
    var dockTiles = tiles.slice(0, 6);
    dock.setAttribute('data-cols', String(core.dockColumns(dockTiles.length)));
    dockTiles.forEach(function (app) {
      if (app.kind === 'input') {
        var source = document.createElement('button');
        source.setAttribute('data-id', app.id); drawInput(app, source);
        source.addEventListener('click', function () { openInputTile(app, source); });
        source.addEventListener('focus', function () { live.focus(app, source); });
        source.addEventListener('blur', function () { live.blur(source); });
        dock.appendChild(source);
        return;
      }
      var identity = brand(app.name), button = document.createElement('button');
      button.className = 'app-tile ' + identity[0];
      button.setAttribute('aria-label', app.name);
      var symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = identity[1];
      var label = document.createElement('span'); label.className = 'tile-label'; label.textContent = identity[2];
      button.appendChild(symbol); button.appendChild(label);
      button.addEventListener('click', function () { openShortcut(app.id); });
      dock.appendChild(button);
    });
    if (dockTiles.length < 6) {
      var all = document.createElement('button'); all.id = 'btn-library'; all.className = 'app-tile library-tile';
      all.setAttribute('aria-label', 'Tất cả ứng dụng');
      var allLabel = document.createElement('span'); allLabel.className = 'tile-label'; allLabel.textContent = 'Ứng dụng';
      all.appendChild(glyph('library')); all.appendChild(allLabel);
      all.addEventListener('click', openLibrary);
      dock.appendChild(all);
    }
    if (!tiles.length) announce('Dock chưa có ứng dụng. Chọn ô Ứng dụng để ghim.');
  }

  // ---- App library ----
  var library = $('library'), libraryGrid = $('library-grid'), libraryOpen = false, editing = false;
  var LIBRARY_COLS = 6;
  function saveDock() {
    try { localStorage.setItem('cyt-dock-apps', JSON.stringify(dockList)); }
    catch (error) { announce('Không lưu được dock. Thay đổi chỉ có hiệu lực trong phiên này.'); }
  }
  // Keep the saved order and the input tiles; newly pinned apps join at the end.
  function rebuildDock() {
    var order = tiles.map(function (tile) { return tile.id; });
    var inputs = tiles.filter(function (tile) { return tile.kind === 'input'; });
    tiles = core.orderApps(dockList.concat(inputs), order);
    // Save the order too, so a restart shows the new pin exactly where it appeared.
    try { localStorage.setItem('cyt-order', JSON.stringify(tiles.map(function (tile) { return tile.id; }))); }
    catch (error) { /* saveDock already told the viewer */ }
    render();
  }
  function isPinned(id) { return dockList.some(function (app) { return app.id === id; }); }
  function libraryHint() {
    $('library-edit').textContent = editing ? 'Xong' : 'Sửa dock';
    $('library-hint').textContent = editing ? 'OK để ghim hoặc bỏ ghim khỏi dock  ·  Back khi xong'
      : 'OK để mở  ·  Sửa dock để chọn ứng dụng cho màn hình chính';
    library.classList.toggle('editing', editing);
  }
  function drawLibraryTile(app, button) {
    var on = isPinned(app.id);
    button.classList.toggle('pinned', on);
    button.setAttribute('aria-label', app.name + (on ? ', đã ghim vào dock' : ''));
    button.querySelector('.pin').textContent = on ? '✓' : '+';
  }
  function libraryTile(app) {
    var identity = brand(app.name), button = document.createElement('button');
    button.className = 'lib-tile ' + identity[0];
    if (app.icon) {
      // An icon the TV refuses to show (CSP, missing file) falls back to the typographic tile.
      var icon = document.createElement('img'); icon.className = 'icon'; icon.alt = '';
      icon.addEventListener('error', function () {
        if (icon.parentNode) icon.parentNode.removeChild(icon);
        button.classList.remove('has-icon');
      });
      button.classList.add('has-icon'); button.appendChild(icon); icon.src = app.icon;
    }
    var symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = identity[1];
    var name = document.createElement('span'); name.className = 'lib-name'; name.textContent = app.name;
    var pin = document.createElement('span'); pin.className = 'pin'; pin.setAttribute('aria-hidden', 'true');
    button.appendChild(symbol); button.appendChild(name); button.appendChild(pin);
    button.addEventListener('click', function () { activateLibrary(app, button); });
    button.addEventListener('focus', function () { try { button.scrollIntoView({block: 'nearest'}); } catch (error) { /* old engines */ } });
    drawLibraryTile(app, button);
    return button;
  }
  function activateLibrary(app, button) {
    if (!editing) { closeLibrary(); openShortcut(app.id); return; }
    var result = core.togglePin(dockList, app);
    if (result.full) { announce('Dock đã đủ ' + core.DOCK_MAX + ' ứng dụng. Bỏ ghim một ứng dụng trước.'); return; }
    dockList = result.list; saveDock(); rebuildDock(); drawLibraryTile(app, button);
  }
  function fillLibrary(apps) {
    if (!libraryOpen) return;
    libraryGrid.textContent = '';
    $('library-count').textContent = apps.length ? String(apps.length) : '';
    if (!apps.length) {
      var empty = document.createElement('p'); empty.className = 'library-empty';
      empty.textContent = 'TV chưa trả về ứng dụng nào.'; libraryGrid.appendChild(empty); return;
    }
    apps.forEach(function (app) { libraryGrid.appendChild(libraryTile(app)); });
    libraryGrid.firstChild.focus();
  }
  // Installed apps from the TV; the launcher itself and Samsung Home stay out (Samsung Home lives in Settings).
  function readLibrary(done) {
    var exclude = {package: config.package, ids: [config.samsungHome, config.appId]};
    if (!tv || !tv.application || !tv.application.getAppsInfo) { done(core.libraryApps(config.previewLibrary || config.apps, exclude)); return; }
    function fallback() {
      announce('TV không cho xem danh sách ứng dụng. Đang hiện các ứng dụng trên dock.');
      done(core.libraryApps(dockList, exclude));
    }
    try { tv.application.getAppsInfo(function (list) { done(core.libraryApps(list, exclude)); }, fallback); }
    catch (error) { fallback(); }
  }
  var lastDockIndex = 0;
  function fillSelectedApps() {
    libraryGrid.textContent = '';
    $('library-count').textContent = tiles.length ? String(tiles.length) : '';
    $('library-hint').textContent = 'OK để mở  ·  Sửa dock để chọn ứng dụng cho màn hình chính  ·  Back để quay lại';
    tiles.forEach(function (app) {
      if (app.kind === 'input') {
        var source = document.createElement('button');
        source.className = 'lib-tile input-tile ' + core.deviceStyle(app.name);
        source.setAttribute('data-id', app.id);
        var label = document.createElement('span'); label.className = 'lib-name'; label.textContent = app.name;
        source.appendChild(glyph('device')); source.appendChild(label);
        source.addEventListener('click', function () { closeLibrary(); openInputTile(app, source); });
        libraryGrid.appendChild(source);
        return;
      }
      libraryGrid.appendChild(libraryTile(app));
    });
    if (libraryGrid.firstChild) libraryGrid.firstChild.focus();
  }
  function openLibrary() {
    editing = false; libraryHint();
    libraryOpen = true; document.body.classList.add('library-open'); library.hidden = false;
    fillSelectedApps();
  }
  function closeLibrary() {
    libraryOpen = false; editing = false; library.hidden = true; document.body.classList.remove('library-open');
    var target = (dock.children && dock.children[lastDockIndex]) || (dock.children && dock.children[0]) || $('btn-library');
    if (target) target.focus();
  }
  function libraryBack() {
    if (editing) { editing = false; libraryHint(); fillSelectedApps(); return; }
    closeLibrary();
  }
  $('library-edit').addEventListener('click', function () {
    editing = !editing; libraryHint();
    if (editing) {
      libraryGrid.textContent = ''; $('library-count').textContent = '';
      readLibrary(fillLibrary);
    } else {
      fillSelectedApps();
    }
  });
  function closePanel() { panel.hidden = true; home.hidden = false; centerButton.focus(); }
  function openPanel() {
    var target = $('arrange'); target.textContent = '';
    tiles.forEach(function (app, index) {
      var button = document.createElement('button');
      button.textContent = ('0' + (index + 1)).slice(-2) + '  ' + app.name + (app.kind === 'input' ? '  ·  ' + app.title : '') + '  ↑';
      button.addEventListener('click', function () {
        tiles.splice(index, 1); tiles.unshift(app);
        try { localStorage.setItem('cyt-order', JSON.stringify(tiles.map(function (item) { return item.id; }))); }
        catch (error) { announce('Không lưu được thứ tự. Thay đổi vẫn có hiệu lực trong phiên này.'); }
        render(); openPanel();
      });
      target.appendChild(button);
    });
    home.hidden = true; panel.hidden = false; $('close-panel').focus();
  }

  // ---- Wiring ----
  centerButton.addEventListener('click', function () { if (openMenu) closeMenu(); else openControls(); });
  centerButton.addEventListener('focus', function () { caption.textContent = 'Điều khiển'; });
  centerButton.addEventListener('blur', function () { caption.textContent = ''; });
  $('close-panel').addEventListener('click', closePanel);

  // Move focus, or at an edge nudge the focused item toward the key so the press is never silent.
  var NUDGE_NAMES = ['nudge-left', 'nudge-right', 'nudge-up', 'nudge-down'];
  function moveFocus(target, key) {
    var here = document.activeElement;
    if (target && target !== here) { target.focus(); return; }
    var name = core.nudgeClass(key);
    if (!name || !here || !here.classList) return;
    NUDGE_NAMES.forEach(function (old) { here.classList.remove(old); });
    void here.offsetWidth; // restart the animation on repeated presses
    here.classList.add(name);
  }
  document.addEventListener('animationend', function (event) {
    if (event.target && event.target.classList && /^(flat|lift)-/.test(event.animationName)) {
      NUDGE_NAMES.forEach(function (old) { event.target.classList.remove(old); });
    }
  });
  function focusRows() {
    var rows = [[centerButton]], buttons = Array.prototype.slice.call(dock.children), cols = core.dockColumns(buttons.length);
    for (var start = 0; start < buttons.length; start += cols) rows.push(buttons.slice(start, start + cols));
    return rows;
  }
  document.addEventListener('keydown', function (event) {
    var key = event.key;
    clock(); wallpaper(); // Catch a missed resume event: the TV may wake with a stale date.
    if (ambient.onKey(event)) { event.preventDefault(); return; } // the key only woke the screensaver
    if (setup.isOpen()) { setup.onKey(event); return; } // setup owns every key, Back included
    if (event.keyCode === 10009 || key === 'Escape') {
      event.preventDefault();
      if (videoOn) leaveVideo();
      else if (picking) pickerBack();
      else if (libraryOpen) libraryBack();
      else if (!panel.hidden) closePanel();
      else if (openMenu) menuBack();
      else returnHome();
      return;
    }
    if (videoOn) { event.preventDefault(); return; }
    if (key === 'Enter' && document.activeElement && document.activeElement.click) {
      event.preventDefault(); document.activeElement.click(); return;
    }
    if (key.indexOf('Arrow') !== 0) return;
    event.preventDefault();
    if (picking) {
      var thumbs = Array.prototype.slice.call($('picker-grid').children), lines = [];
      for (var from = 0; from < thumbs.length; from += 5) lines.push(thumbs.slice(from, from + 5));
      var here = {row: 0, col: 0};
      lines.forEach(function (line, rowIndex) { var col = line.indexOf(document.activeElement); if (col >= 0) here = {row: rowIndex, col: col}; });
      var moved = core.nextFocus(lines, here, key); moveFocus(lines[moved.row][moved.col], key);
      return;
    }
    if (libraryOpen) {
      var cells = Array.prototype.slice.call(libraryGrid.querySelectorAll('.lib-tile')), table = [[$('library-edit')]];
      for (var cell = 0; cell < cells.length; cell += LIBRARY_COLS) table.push(cells.slice(cell, cell + LIBRARY_COLS));
      var spot = {row: 0, col: 0};
      table.forEach(function (line, rowIndex) { var col = line.indexOf(document.activeElement); if (col >= 0) spot = {row: rowIndex, col: col}; });
      if (key === 'ArrowUp' && spot.row === 0) {
        closeLibrary();
        return;
      }
      var go = core.nextFocus(table, spot, key); moveFocus(table[go.row][go.col], key);
      return;
    }
    if (openMenu) {
      var rows = menuRows(), at = rows.indexOf(document.activeElement);
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        if (at >= 0 && rows[at].getAttribute('data-adjust') === 'volume') adjustVolume(key, rows[at]);
        return;
      }
      var to = core.step(at < 0 ? 0 : at, rows.length, key);
      if (to >= 0 && rows[to]) moveFocus(rows[to], key);
      return;
    }
    if (!panel.hidden) {
      var list = [$('close-panel')].concat(Array.prototype.slice.call(document.querySelectorAll('#arrange button')));
      var index = list.indexOf(document.activeElement), next = core.step(index < 0 ? 0 : index, list.length, key);
      if (next >= 0) moveFocus(list[next], key);
      return;
    }
    var grid = focusRows(), position = {row: 0, col: 0};
    grid.forEach(function (line, rowIndex) { var col = line.indexOf(document.activeElement); if (col >= 0) position = {row: rowIndex, col: col}; });
    if (position.row > 0 && key === 'ArrowDown') {
      lastDockIndex = position.col;
      openLibrary();
      return;
    }
    var target = core.nextFocus(grid, position, key); moveFocus(grid[target.row][target.col], key);
  });
  // Do not register or intercept Home/Power. In particular, leave The Frame Art Mode alone.
  document.addEventListener('visibilitychange', function () {
    ambient.visible(!document.hidden);
    live.visibility(!document.hidden);
    core.tellService(tv, config.serviceId, document.hidden ? 'ui-hidden' : 'ui-visible', function () {});
    if (document.hidden) { clearInterval(clockTimer); clockTimer = null; }
    else { tick(); if (!clockTimer) clockTimer = setInterval(tick, 30000); }
  });
  var shownWallpaper = null;
  function applyWallpaper(url) {
    if (!url || url === shownWallpaper) return;
    shownWallpaper = url;
    document.body.style.backgroundImage = 'url("' + url + '")';
    document.body.classList.add('has-wallpaper');
    ambient.wallpaperChanged(url);
  }
  function wallpaper() {
    if (picking) return;
    applyWallpaper(core.wallpaperFor(config.wallpapers, new Date(), preference));
  }
  function wallpaperName(value) {
    var index = (config.wallpapers || []).indexOf(value);
    return index >= 0 ? 'Hình ' + (index + 1) : 'Tự động';
  }
  function closePicker() {
    picking = false; $('picker').hidden = true; document.body.classList.remove('picking');
    centerButton.focus();
  }
  function openPicker() {
    var names = config.wallpapers || [], grid = $('picker-grid'), previous = shownWallpaper;
    var options = [{value: 'auto', tag: 'Tự động mỗi ngày', url: core.wallpaperFor(names, new Date(), 'auto')}];
    names.forEach(function (name, index) { options.push({value: name, tag: 'Hình ' + (index + 1), url: core.wallpaperFor(names, new Date(), name)}); });
    var current = names.indexOf(preference) >= 0 ? preference : 'auto', focusTarget = null;
    grid.textContent = '';
    options.forEach(function (option) {
      var button = document.createElement('button'); button.className = 'thumb'; button.setAttribute('role', 'option');
      button.style.backgroundImage = 'url("' + option.url + '")';
      var tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = option.tag; button.appendChild(tag);
      if (option.value === current) {
        var check = document.createElement('span'); check.className = 'check'; check.textContent = '✓'; button.appendChild(check);
        focusTarget = button;
      }
      button.addEventListener('focus', function () { applyWallpaper(option.url); });
      button.addEventListener('click', function () {
        preference = option.value;
        try { localStorage.setItem('cyt-wallpaper', preference); }
        catch (error) { announce('Không lưu được hình nền. Lựa chọn chỉ có hiệu lực trong phiên này.'); }
        closePicker(); wallpaper();
      });
      grid.appendChild(button);
    });
    pickerBack = function () { picking = false; applyWallpaper(previous); closePicker(); };
    picking = true; document.body.classList.add('picking'); $('picker').hidden = false;
    (focusTarget || grid.firstChild).focus();
  }
  // ---- Live inputs: opt-in tile preview and the "device ready" hint (inputs-live.js) ----
  // `preview` is a build-time opt-in; setup keeps it in the TV-saved list, and live reads the current list each time.
  var live = window.CytInputsLive.create({tv: tv, inputs: function () { return inputsConfig; }, tiles: function () { return tiles; }, button: inputButton,
    readSources: readSources, refreshInputs: refreshInputs, moveFocus: moveFocus, glyph: glyph, deviceStyle: core.deviceStyle,
    state: function () { return {menu: !!openMenu, picking: picking, library: libraryOpen, panel: !panel.hidden, video: videoOn}; }});
  // ---- First-run setup ----
  function openSetup() {
    setup.open({config: config, tv: tv, core: core, dock: dockList, inputs: inputsConfig, greeting: setup.storedGreeting(config.greetingName),
      brand: brand, hello: calendar.greeting, moveFocus: moveFocus, announce: announce, onDone: applySetup});
  }
  // Apply the saved choices in place, without a reload, keeping the order saved on this TV.
  function applySetup() {
    inputsConfig = setup.storedInputs(config.inputs, setup.readJson('cyt-inputs'));
    dockList = core.dockApps(config.apps || [], setup.readJson('cyt-dock-apps'));
    tiles = core.orderApps(dockList.concat(core.dockInputs(inputsConfig, null)), setup.readJson('cyt-order'));
    render(); readInputs(); clock(); (dock.firstChild || centerButton).focus();
  }
  function tick() { clock(); readWifi(); wallpaper(); readInputs(); ambient.tick(new Date()); }
  clock(); readWifi(); wallpaper(); clockTimer = setInterval(tick, 30000);
  if (!tv) $('mode').textContent = 'BẢN XEM TRƯỚC TRÊN MÁY TÍNH · KHÔNG THAY ĐỔI TV';
  core.tellService(tv, config.serviceId, 'resume', function () {});
  render(); readInputs(); (dock.firstChild || centerButton).focus();
  if (setup.shouldShow(config)) openSetup();
}());
