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
  return {nextFocus: nextFocus, orderApps: orderApps, launch: launch};
}));
