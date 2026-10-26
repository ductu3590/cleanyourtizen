(function () {
  'use strict';
  var config = window.CYT_CONFIG, core = window.CytCore, tv = window.tizen;
  var $ = function (id) { return document.getElementById(id); };
  var dock = $('dock'), panel = $('panel'), message = $('message'), home = $('home');
  var menu = $('menu'), menuItems = $('menu-items'), caption = $('caption');
  var pill = [$('btn-input'), $('btn-wifi'), $('btn-settings')];
  var CAPTIONS = {input: 'Nguồn vào', wifi: 'Wi-Fi', settings: 'Cài đặt'};
  var MAIN_RECT = ['0px', '0px', '1920px', '1080px'];
  var timer, saved = [], openMenu = null, videoOn = false, clockTimer = null, picking = false, pickerBack = null;
  var preference = 'auto';
  try { preference = localStorage.getItem('cyt-wallpaper') || 'auto'; } catch (error) { preference = 'auto'; }
  try { saved = JSON.parse(localStorage.getItem('cyt-order') || '[]'); } catch (error) { saved = []; }
  var apps = core.orderApps(config.apps || [], saved);

  function announce(text) {
    message.textContent = text; message.hidden = false;
    clearTimeout(timer); timer = setTimeout(function () { message.hidden = true; }, 6000);
  }
  function openApp(id) { core.launch(tv, id, function () {}, announce); }
  function hideVideo(done) {
    var finish = function () { if (done) done(); };
    if (!videoOn || !tv || !tv.tvwindow) { videoOn = false; finish(); return; }
    videoOn = false;
    try { tv.tvwindow.hide(finish, finish, 'MAIN'); } catch (error) { finish(); }
  }
  function returnHome() {
    hideVideo(function () {
      if (config.samsungHome) { openApp(config.samsungHome); return; }
      try { tv.application.getCurrentApplication().exit(); }
      catch (error) { announce('Bản xem trước · Thoát launcher'); }
    });
  }

  // ---- Clock, Wi-Fi ----
  function clock() {
    var now = new Date();
    $('time').textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    $('date').textContent = now.toLocaleDateString('vi-VN', {weekday: 'long', day: 'numeric', month: 'long'});
  }
  var wifi = core.wifiInfo(null);
  function readWifi(done) {
    if (!tv || !tv.systeminfo) { if (done) done(); return; }
    try {
      tv.systeminfo.getPropertyValue('WIFI_NETWORK', function (value) {
        wifi = core.wifiInfo(value); $('btn-wifi').setAttribute('data-bars', String(wifi.bars)); if (done) done();
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

  // ---- Menu ----
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
    if (!onActivate) button.setAttribute('aria-disabled', 'true');
    else button.addEventListener('click', onActivate);
    menuItems.appendChild(button);
    return {button: button, value: right};
  }
  function setMenuOpen(name) {
    openMenu = name;
    document.body.classList.toggle('menu-open', !!name);
    pill.forEach(function (button) { button.classList.toggle('active', button.getAttribute('data-menu') === name); });
    menu.hidden = !name;
  }
  function closeMenu() {
    var name = openMenu; setMenuOpen(null);
    if (name) $('btn-' + name).focus();
  }
  function focusFirstRow() { var first = menuItems.firstChild; if (first) first.focus(); }
  function showMenu(name, title, build) {
    menuItems.textContent = ''; $('menu-title').textContent = title; build(); setMenuOpen(name); focusFirstRow();
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
  function selectSource(choice) {
    if (!tv || !tv.tvwindow) { announce('Bản xem trước · ' + choice.title); return; }
    try { tv.tvwindow.setSource(choice.source, enterVideo(choice), function () { announce('Không chuyển được sang ' + choice.title + '.'); }); }
    catch (error) { announce('TV chưa cho phép chuyển nguồn này.'); }
  }
  function leaveVideo() {
    hideVideo(function () {
      document.documentElement.classList.remove('video'); document.body.classList.remove('video');
      $('btn-input').focus();
    });
  }
  function buildInput(choices) {
    if (!choices.length) { row('Chưa có nguồn nào được chọn', '', null); return; }
    choices.forEach(function (choice) {
      row(choice.title, choice.name || (choice.connected ? 'Đang kết nối' : 'Không có tín hiệu'),
        function () { selectSource(choice); }, {dot: choice.connected});
    });
  }
  function openInput() {
    readSources(function (value) {
      showMenu('input', 'Nguồn vào', function () { buildInput(core.inputChoices(value, config.inputs)); });
    });
  }
  function openWifi() {
    readWifi(function () {
      showMenu('wifi', 'Wi-Fi', function () {
        if (!wifi.on) { row('Wi-Fi', 'Đang tắt hoặc chưa kết nối', null); return; }
        row('Mạng', wifi.ssid, null); row('Tín hiệu', wifi.percent + '%', null);
      });
    });
  }
  function openSettings() {
    showMenu('settings', 'Cài đặt', function () {
      var current = volume();
      var volumeRow = row('Âm lượng', current === null ? 'Không điều khiển được' : '‹  ' + current + '  ›', null, {adjust: 'volume'});
      volumeRow.button.removeAttribute('aria-disabled');
      if (current === null) volumeRow.button.setAttribute('aria-disabled', 'true');
      var muteRow = row('Tắt tiếng', muted() ? 'Bật' : 'Tắt', function () {
        try { audio().setMute(!muted()); muteRow.value.textContent = muted() ? 'Bật' : 'Tắt'; }
        catch (error) { announce('Không điều khiển được âm thanh.'); }
      });
      if ((config.wallpapers || []).length) {
        row('Hình nền', wallpaperName(preference) + '  ›', function () { setMenuOpen(null); openPicker(); });
      }
      row('Sắp xếp ứng dụng', '›', function () { setMenuOpen(null); openPanel(); });
      row('Samsung Home', '↗', returnHome);
    });
  }
  function toggleMenu(name) {
    if (openMenu === name) { closeMenu(); return; }
    if (name === 'input') openInput(); else if (name === 'wifi') openWifi(); else openSettings();
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
    return ['generic', name.substring(0, 2).toUpperCase(), name];
  }
  function render() {
    dock.textContent = '';
    apps.forEach(function (app) {
      var identity = brand(app.name), button = document.createElement('button');
      button.className = 'app-tile ' + identity[0];
      button.setAttribute('aria-label', app.name);
      var symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = identity[1];
      var label = document.createElement('span'); label.className = 'tile-label'; label.textContent = identity[2];
      button.appendChild(symbol); button.appendChild(label);
      button.addEventListener('click', function () { openApp(app.id); });
      dock.appendChild(button);
    });
    if (!apps.length) announce('Chưa có ứng dụng được chọn. Nút Cài đặt → Samsung Home luôn sẵn sàng.');
  }
  function closePanel() { panel.hidden = true; home.hidden = false; $('btn-settings').focus(); }
  function openPanel() {
    var target = $('arrange'); target.textContent = '';
    apps.forEach(function (app, index) {
      var button = document.createElement('button'); button.textContent = ('0' + (index + 1)).slice(-2) + '  ' + app.name + '  ↑';
      button.addEventListener('click', function () {
        apps.splice(index, 1); apps.unshift(app);
        try { localStorage.setItem('cyt-order', JSON.stringify(apps.map(function (item) { return item.id; }))); }
        catch (error) { announce('Không lưu được thứ tự. Thay đổi vẫn có hiệu lực trong phiên này.'); }
        render(); openPanel();
      });
      target.appendChild(button);
    });
    home.hidden = true; panel.hidden = false; $('close-panel').focus();
  }

  // ---- Wiring ----
  pill.forEach(function (button) {
    button.addEventListener('click', function () { toggleMenu(button.getAttribute('data-menu')); });
    button.addEventListener('focus', function () { caption.textContent = CAPTIONS[button.getAttribute('data-menu')]; });
    button.addEventListener('blur', function () { caption.textContent = ''; });
  });
  $('close-panel').addEventListener('click', closePanel);

  function focusRows() {
    var rows = [pill], tiles = Array.prototype.slice.call(dock.children);
    for (var start = 0; start < tiles.length; start += 5) rows.push(tiles.slice(start, start + 5));
    return rows;
  }
  document.addEventListener('keydown', function (event) {
    var key = event.key;
    clock(); wallpaper(); // Catch a missed resume event: the TV may wake with a stale date.
    if (event.keyCode === 10009 || key === 'Escape') {
      event.preventDefault();
      if (videoOn) leaveVideo();
      else if (picking) pickerBack();
      else if (!panel.hidden) closePanel();
      else if (openMenu) closeMenu();
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
      var moved = core.nextFocus(lines, here, key); lines[moved.row][moved.col].focus();
      return;
    }
    if (openMenu) {
      var rows = Array.prototype.slice.call(menuItems.children), at = rows.indexOf(document.activeElement);
      if (key === 'ArrowLeft' || key === 'ArrowRight') {
        if (at >= 0 && rows[at].getAttribute('data-adjust') === 'volume') adjustVolume(key, rows[at]);
        return;
      }
      var to = core.step(at < 0 ? 0 : at, rows.length, key);
      if (to >= 0 && rows[to]) rows[to].focus();
      return;
    }
    if (!panel.hidden) {
      var list = [$('close-panel')].concat(Array.prototype.slice.call(document.querySelectorAll('#arrange button')));
      var index = list.indexOf(document.activeElement), next = core.step(index < 0 ? 0 : index, list.length, key);
      if (next >= 0) list[next].focus();
      return;
    }
    var grid = focusRows(), position = {row: 0, col: 0};
    grid.forEach(function (line, rowIndex) { var col = line.indexOf(document.activeElement); if (col >= 0) position = {row: rowIndex, col: col}; });
    var target = core.nextFocus(grid, position, key); grid[target.row][target.col].focus();
  });
  // Do not register or intercept Home/Power. In particular, leave The Frame Art Mode alone.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearInterval(clockTimer); clockTimer = null; }
    else { tick(); if (!clockTimer) clockTimer = setInterval(tick, 30000); }
  });
  var shownWallpaper = null;
  function applyWallpaper(url) {
    if (!url || url === shownWallpaper) return;
    shownWallpaper = url;
    document.body.style.backgroundImage = 'url("' + url + '")';
    document.body.classList.add('has-wallpaper');
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
    $('btn-settings').focus();
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
  function tick() { clock(); readWifi(); wallpaper(); }
  clock(); readWifi(); wallpaper(); clockTimer = setInterval(tick, 30000);
  if (!tv) $('mode').textContent = 'BẢN XEM TRƯỚC TRÊN MÁY TÍNH · KHÔNG THAY ĐỔI TV';
  render(); (dock.firstChild || $('btn-settings')).focus();
}());
