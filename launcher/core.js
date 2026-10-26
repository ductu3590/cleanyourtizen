(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CytCore = factory();
}(this, function () {
  'use strict';
  function nextFocus(rows, position, key) {
    var row = position.row, col = position.col;
    if (!rows.length || !rows[row] || !rows[row].length) return position;
    if (key === 'ArrowLeft') col = Math.max(0, col - 1);
    if (key === 'ArrowRight') col = Math.min(rows[row].length - 1, col + 1);
    if (key === 'ArrowUp') row = Math.max(0, row - 1);
    if (key === 'ArrowDown') row = Math.min(rows.length - 1, row + 1);
    return {row: row, col: Math.min(col, rows[row].length - 1)};
  }
  function orderApps(apps, saved) {
    var ids = Object.create(null), result = [];
    apps.forEach(function (app) { if (!ids[app.id]) ids[app.id] = app; });
    (Array.isArray(saved) ? saved : []).forEach(function (id) {
      if (Object.prototype.hasOwnProperty.call(ids, id)) { result.push(ids[id]); delete ids[id]; }
    });
    apps.forEach(function (app) {
      if (Object.prototype.hasOwnProperty.call(ids, app.id)) { result.push(app); delete ids[app.id]; }
    });
    return result;
  }
  function launch(api, id, success, failure) {
    if (!/^[A-Za-z0-9_][A-Za-z0-9_.-]{0,159}$/.test(id || '')) { failure('Ứng dụng không hợp lệ.'); return; }
    if (!api || !api.application) { failure('Bản xem trước · ' + id); return; }
    try {
      api.application.launch(id, success, function () { failure('Không mở được ứng dụng. Bạn vẫn có thể quay về Samsung Home.'); });
    } catch (error) { failure('TV chưa cho phép mở ứng dụng này.'); }
  }
  function inputChoices(value, allow) {
    var out = [], seen = Object.create(null), wanted = Array.isArray(allow) ? allow : [];
    [['connected', true], ['disconnected', false]].forEach(function (group) {
      var list = value && Array.isArray(value[group[0]]) ? value[group[0]] : [];
      list.forEach(function (source) {
        if (!source || typeof source.type !== 'string' || typeof source.number !== 'number') return;
        var key = source.type + ':' + source.number;
        var allowed = wanted.some(function (item) { return item && item.type === source.type && item.number === source.number; });
        if (!allowed || seen[key]) return;
        seen[key] = true;
        var name = typeof source.editName === 'string' ? source.editName : '';
        out.push({source: source, key: key, title: source.type + ' ' + source.number, name: name, connected: group[1]});
      });
    });
    return out;
  }
  function wifiInfo(value) {
    var on = !!value && value.status === 'ON' && typeof value.ssid === 'string' && value.ssid !== '';
    var strength = on && typeof value.signalStrength === 'number' ? Math.max(0, Math.min(1, value.signalStrength)) : 0;
    return {on: on, ssid: on ? value.ssid : '', percent: Math.round(strength * 100), bars: on ? Math.max(1, Math.ceil(strength * 3)) : 0};
  }
  function step(index, count, key) {
    if (!count) return -1;
    if (key === 'ArrowDown') return Math.min(count - 1, index + 1);
    if (key === 'ArrowUp') return Math.max(0, index - 1);
    return index;
  }
  function adjustVolume(volume, key, amount) {
    var current = typeof volume === 'number' ? volume : 0, delta = amount || 2;
    if (key === 'ArrowLeft') current -= delta;
    if (key === 'ArrowRight') current += delta;
    return Math.max(0, Math.min(100, current));
  }
  return {nextFocus: nextFocus, orderApps: orderApps, launch: launch, inputChoices: inputChoices,
    wifiInfo: wifiInfo, step: step, adjustVolume: adjustVolume};
}));
