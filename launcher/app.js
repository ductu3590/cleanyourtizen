(function () {
  'use strict';
  var config = window.CYT_CONFIG, core = window.CytCore;
  var dock = document.getElementById('dock'), panel = document.getElementById('panel');
  var message = document.getElementById('message'), timer, saved = [];
  try { saved = JSON.parse(localStorage.getItem('cyt-order') || '[]'); } catch (error) { saved = []; }
  var apps = core.orderApps(config.apps || [], saved);
  function announce(text) {
    message.textContent = text; message.hidden = false;
    clearTimeout(timer); timer = setTimeout(function () { message.hidden = true; }, 6000);
  }
  function openApp(id) { core.launch(window.tizen, id, function () {}, announce); }
  function returnHome() {
    if (config.samsungHome) { openApp(config.samsungHome); return; }
    try { window.tizen.application.getCurrentApplication().exit(); }
    catch (error) { announce('Bản xem trước · Thoát launcher'); }
  }
  function clock() {
    var now = new Date();
    document.getElementById('time').textContent = ('0' + now.getHours()).slice(-2) + ':' + ('0' + now.getMinutes()).slice(-2);
    document.getElementById('date').textContent = now.toLocaleDateString('vi-VN', {weekday: 'long', day: 'numeric', month: 'long'});
  }
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
      button.setAttribute('data-zone', 'apps'); button.setAttribute('aria-label', app.name);
      var symbol = document.createElement('span'); symbol.className = 'symbol'; symbol.textContent = identity[1];
      var label = document.createElement('span'); label.className = 'tile-label'; label.textContent = identity[2];
      button.appendChild(symbol); button.appendChild(label);
      button.addEventListener('click', function () { openApp(app.id); });
      button.addEventListener('focus', function () { document.getElementById('selection').textContent = app.name + ' ↗'; });
      dock.appendChild(button);
    });
    if (!apps.length) announce('Chưa có ứng dụng được chọn. Nút Samsung Home luôn sẵn sàng.');
  }
  function closePanel() {
    panel.hidden = true; document.getElementById('home').hidden = false;
    document.getElementById('settings').focus();
  }
  function openPanel() {
    var target = document.getElementById('arrange'); target.textContent = '';
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
    document.getElementById('home').hidden = true; panel.hidden = false;
    document.getElementById('close-panel').focus();
  }
  document.getElementById('settings').addEventListener('click', openPanel);
  document.getElementById('close-panel').addEventListener('click', closePanel);
  document.getElementById('library').addEventListener('click', function () {
    if (dock.firstChild) dock.firstChild.focus(); else announce('Chưa có shortcut.');
  });
  document.getElementById('samsung').addEventListener('click', returnHome);
  if (!config.samsungHome) document.getElementById('samsung').textContent = 'Thoát launcher ↗';
  document.addEventListener('keydown', function (event) {
    var key = event.key;
    if (event.keyCode === 10009 || key === 'Escape') {
      event.preventDefault(); if (!panel.hidden) closePanel(); else returnHome(); return;
    }
    if (key.indexOf('Arrow') !== 0) return;
    event.preventDefault();
    var rows;
    if (!panel.hidden) rows = [[document.getElementById('close-panel')]].concat(Array.prototype.map.call(document.querySelectorAll('#arrange button'), function (button) { return [button]; }));
    else {
      rows = [Array.prototype.slice.call(document.querySelectorAll('nav button'))];
      var tiles = Array.prototype.slice.call(dock.children);
      for (var start = 0; start < tiles.length; start += 5) rows.push(tiles.slice(start, start + 5));
    }
    var position = {row: 0, col: 0};
    rows.forEach(function (row, index) { var col = row.indexOf(document.activeElement); if (col >= 0) position = {row: index, col: col}; });
    var next = core.nextFocus(rows, position, key); rows[next.row][next.col].focus();
  });
  // Do not register or intercept Home/Power. In particular, leave The Frame Art Mode alone.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) { clearInterval(clockTimer); clockTimer = null; }
    else { clock(); if (!clockTimer) clockTimer = setInterval(clock, 30000); }
  });
  clock(); var clockTimer = setInterval(clock, 30000);
  if (!window.tizen) document.getElementById('mode').textContent = 'DESKTOP PREVIEW · NO TV CHANGES';
  render(); (dock.firstChild || document.getElementById('samsung')).focus();
}());
