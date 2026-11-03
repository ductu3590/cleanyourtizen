// First-run setup on the TV: choose the dock apps, the HDMI tiles and a greeting name with the D-pad.
// Everything is saved in this app's localStorage on this TV; nothing leaves the device.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CytSetup = factory();
}(this, function () {
  'use strict';
  var INPUT_TYPE = /^[A-Z][A-Z0-9_]{0,15}$/, MAX_INPUTS = 16, GREETING_MAX = 24, DOCK_MAX = 12;
  var INPUT_FIELDS = {type: true, number: true, dock: true, label: true, preview: true};
  // C0/C1 controls, zero-width and bidi formatting characters: never part of a name shown on the TV.
  var CONTROL = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g;

  function cleanText(value, max) {
    return typeof value === 'string' ? value.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
  }
  // "HDMI:4" for a valid physical input; the TV tuner is not an input you pin.
  function inputKey(item) {
    if (!item || typeof item.type !== 'string' || !INPUT_TYPE.test(item.type) || item.type === 'TV') return null;
    if (typeof item.number !== 'number' || item.number % 1 !== 0 || item.number < 1 || item.number > 99) return null;
    return item.type + ':' + item.number;
  }
  // Inputs saved by setup on this TV, in the config schema. Anything unexpected keeps the build defaults.
  function storedInputs(defaults, stored) {
    if (!Array.isArray(stored) || stored.length > MAX_INPUTS) return defaults;
    var out = [], seen = Object.create(null);
    for (var index = 0; index < stored.length; index += 1) {
      var item = stored[index], key = inputKey(item);
      if (!key || seen[key] || typeof item.dock !== 'boolean') return defaults;
      if (item.label !== undefined && typeof item.label !== 'string') return defaults;
      if (item.preview !== undefined && typeof item.preview !== 'boolean') return defaults;
      for (var field in item) {
        if (Object.prototype.hasOwnProperty.call(item, field) && !INPUT_FIELDS[field]) return defaults;
      }
      seen[key] = true;
      var entry = {type: item.type, number: item.number, dock: item.dock}, label = cleanText(item.label, 32);
      if (label) entry.label = label;
      if (item.preview === true) entry.preview = true;
      out.push(entry);
    }
    return out;
  }
  // Trim, collapse spaces, drop control characters, at most 24 characters. '' means no name.
  function cleanGreeting(value) {
    if (typeof value !== 'string') return '';
    var text = typeof value.normalize === 'function' ? value.normalize('NFC') : value;
    text = text.replace(CONTROL, ' ').replace(/\s+/g, ' ').trim().slice(0, GREETING_MAX);
    if (/[\ud800-\udbff]$/.test(text)) text = text.slice(0, -1); // never keep half an emoji
    return text.replace(/\s+$/, '');
  }
  // The name saved on this TV wins, even when it is empty; without one the build's greetingName stays.
  function greetingName(stored, fallback) {
    return typeof stored === 'string' ? cleanGreeting(stored) : fallback;
  }
  function sourceEntry(type, number, key, name, connected, configured) {
    var entry = {type: type, number: number, key: key, title: type + ' ' + number, name: name, connected: connected,
      label: configured ? cleanText(configured.label, 32) : '', dock: !!configured && configured.dock === true};
    if (configured && configured.preview === true) entry.preview = true; // the build's live-preview opt-in
    return entry;
  }
  // Every non-tuner source the TV reports (connected first, then disconnected), once per type:number, sorted
  // HDMI first. The TV's editName names the device; a matching config entry keeps its label and dock state.
  // Without a TV answer (preview, refusal) the configured inputs are listed instead.
  function hdmiSources(value, configInputs) {
    var configured = Array.isArray(configInputs) ? configInputs : [], byKey = Object.create(null);
    var out = [], seen = Object.create(null);
    configured.forEach(function (item) { var key = inputKey(item); if (key && !byKey[key]) byKey[key] = item; });
    [['connected', true], ['disconnected', false]].forEach(function (group) {
      var list = value && Array.isArray(value[group[0]]) ? value[group[0]] : [];
      list.forEach(function (source) {
        var key = inputKey(source);
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push(sourceEntry(source.type, source.number, key, cleanText(source.editName, 32), group[1], byKey[key]));
      });
    });
    if (!out.length) {
      configured.forEach(function (item) {
        var key = inputKey(item);
        if (!key || seen[key]) return;
        seen[key] = true;
        out.push(sourceEntry(item.type, item.number, key, '', null, item));
      });
    }
    return out.sort(function (a, b) {
      if (a.type !== b.type) return a.type === 'HDMI' ? -1 : b.type === 'HDMI' ? 1 : a.type < b.type ? -1 : 1;
      return a.number - b.number;
    });
  }
  // What setup saves as `cyt-inputs`: every listed source, so the input menu shows them all.
  function inputsFromSources(sources) {
    return (Array.isArray(sources) ? sources : []).map(function (source) {
      var entry = {type: source.type, number: source.number, dock: source.dock === true};
      if (source.label) entry.label = source.label;
      if (source.preview === true) entry.preview = true; // the build's opt-in survives setup
      return entry;
    });
  }
  // Select or unselect one app; a full selection refuses instead of dropping one silently.
  function toggleSelection(list, app, max) {
    var current = Array.isArray(list) ? list : [], limit = typeof max === 'number' ? max : DOCK_MAX;
    if (current.some(function (item) { return item.id === app.id; })) {
      return {list: current.filter(function (item) { return item.id !== app.id; }), selected: false, full: false};
    }
    if (current.length >= limit) return {list: current, selected: false, full: true};
    return {list: current.concat([{id: app.id, name: app.name}]), selected: true, full: false};
  }
  // The saved dock (`cyt-dock-apps`, `[{id, name}]`): selected apps in grid order, then any selected app the
  // grid does not show (the owner could not unselect it, so it is kept).
  function orderSelection(grid, list) {
    var chosen = Object.create(null), shown = Object.create(null), out = [];
    (Array.isArray(list) ? list : []).forEach(function (item) { chosen[item.id] = item; });
    (Array.isArray(grid) ? grid : []).forEach(function (app) {
      if (chosen[app.id] && !shown[app.id]) { shown[app.id] = true; out.push({id: app.id, name: app.name}); }
    });
    (Array.isArray(list) ? list : []).forEach(function (item) {
      if (!shown[item.id]) { shown[item.id] = true; out.push({id: item.id, name: item.name}); }
    });
    return out;
  }

  // ---- Storage (always guarded: a TV with broken storage must not see setup on every boot) ----
  function storage() {
    try { return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null; }
    catch (error) { return null; }
  }
  function readRaw(key) {
    try { var store = storage(); return store ? store.getItem(key) : null; } catch (error) { return null; }
  }
  function readJson(key) {
    var raw = readRaw(key);
    if (raw === null) return null;
    try { return JSON.parse(raw); } catch (error) { return null; }
  }
  function write(key, value) {
    try { var store = storage(); if (!store) return false; store.setItem(key, value); return true; }
    catch (error) { return false; }
  }
  function storedGreeting(fallback) { return greetingName(readRaw('cyt-greeting'), fallback); }
  // Show setup once: not after it was finished or skipped, not when the build says `setup: false`,
  // and never when storage cannot remember that it ran.
  function shouldShow(config, store) {
    if (config && config.setup === false) return false;
    try {
      var target = arguments.length > 1 ? store : storage();
      if (!target || target.getItem('cyt-setup') !== null) return false;
      target.setItem('cyt-setup-probe', '1'); target.removeItem('cyt-setup-probe');
      return true;
    } catch (error) { return false; }
  }

  // ---- Browser controller: a full-screen glass flow, D-pad only ----
  var COLS = 6, STEPS = 4, view = null, state = null;
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function build() {
    view = {section: element('section', 'setup')};
    view.section.id = 'setup'; view.section.hidden = true;
    view.section.setAttribute('role', 'dialog'); view.section.setAttribute('aria-modal', 'true');
    view.section.setAttribute('aria-labelledby', 'setup-title');
    view.dots = element('div', 'setup-dots'); view.dots.setAttribute('aria-hidden', 'true');
    for (var dot = 0; dot < STEPS; dot += 1) view.dots.appendChild(element('i'));
    view.content = element('div', 'setup-content');
    view.title = element('h1', 'setup-title'); view.title.id = 'setup-title';
    view.lead = element('p', 'setup-lead'); view.body = element('div', 'setup-body');
    view.actions = element('div', 'setup-actions');
    view.content.appendChild(view.title); view.content.appendChild(view.lead);
    view.content.appendChild(view.body); view.content.appendChild(view.actions);
    view.section.appendChild(view.dots); view.section.appendChild(view.content);
    document.body.appendChild(view.section);
  }
  function isOpen() { return !!state; }
  function say(text) { if (state && state.options.announce) state.options.announce(text); }
  function button(label, onActivate) {
    var node = element('button', 'setup-button', label);
    node.addEventListener('click', onActivate);
    return node;
  }
  function keepVisible(node) {
    node.addEventListener('focus', function () { try { node.scrollIntoView({block: 'nearest'}); } catch (error) { /* old engines */ } });
  }
  function chunk(list, size) {
    var rows = [];
    for (var start = 0; start < list.length; start += size) rows.push(list.slice(start, start + size));
    return rows;
  }
  function open(options) {
    if (!view) build();
    var settings = options || {};
    state = {options: settings, step: 0, token: 0, rows: [], apps: null, sources: null,
      selected: (Array.isArray(settings.dock) ? settings.dock : []).map(function (app) { return {id: app.id, name: app.name}; }),
      name: cleanGreeting(settings.greeting)};
    document.body.classList.add('setup-open'); view.section.hidden = false;
    show(1);
  }
  function finish() {
    write('cyt-setup', '1');
    var done = state.options.onDone;
    state = null; view.section.hidden = true; view.field = null;
    document.body.classList.remove('setup-open');
    if (done) done();
  }
  function show(step) {
    state.step = step; state.token += 1; state.rows = [];
    view.body.textContent = ''; view.actions.textContent = ''; view.lead.textContent = ''; view.field = null;
    Array.prototype.forEach.call(view.dots.children, function (dot, index) { dot.className = index === step - 1 ? 'on' : ''; });
    view.content.classList.remove('setup-enter');
    void view.content.offsetWidth; // restart the entrance animation
    view.content.classList.add('setup-enter');
    [welcome, apps, inputs, family][step - 1]();
  }
  function back() { if (state.step <= 1) finish(); else show(state.step - 1); }

  // Step 1
  function welcome() {
    view.title.textContent = 'Chào mừng';
    view.lead.textContent = 'Màn hình chính gọn gàng cho TV này. Chọn ứng dụng, thiết bị HDMI và lời chào trong một phút.';
    var start = button('Bắt đầu', function () { show(2); }), skip = button('Bỏ qua', finish);
    view.actions.appendChild(start); view.actions.appendChild(skip);
    state.rows = [[start, skip]]; start.focus();
  }

  // Step 2
  function brandOf(name) {
    if (state.options.brand) return state.options.brand(name);
    return ['generic', name.substring(0, 2).toUpperCase(), name];
  }
  function isSelected(id) { return state.selected.some(function (item) { return item.id === id; }); }
  function maxApps() { var core = state.options.core; return core && core.DOCK_MAX ? core.DOCK_MAX : DOCK_MAX; }
  function countText() { return 'Đã chọn ' + state.selected.length + '/' + maxApps(); }
  function drawApp(app, node) {
    var on = isSelected(app.id);
    node.classList.toggle('selected', on);
    node.setAttribute('aria-pressed', on ? 'true' : 'false');
    node.setAttribute('aria-label', app.name + (on ? ', đã chọn' : ''));
  }
  function appTile(app) {
    var identity = brandOf(app.name), node = element('button', 'lib-tile setup-app ' + identity[0]);
    if (app.icon) {
      var icon = element('img', 'icon'); icon.alt = '';
      icon.addEventListener('error', function () {
        if (icon.parentNode) icon.parentNode.removeChild(icon);
        node.classList.remove('has-icon');
      });
      node.classList.add('has-icon'); node.appendChild(icon); icon.src = app.icon;
    }
    node.appendChild(element('span', 'symbol', identity[1]));
    node.appendChild(element('span', 'lib-name', app.name));
    var pin = element('span', 'pin', '✓'); pin.setAttribute('aria-hidden', 'true'); node.appendChild(pin);
    node.addEventListener('click', function () {
      var result = toggleSelection(state.selected, app, maxApps());
      if (result.full) { say('Đã đủ ' + maxApps() + ' ứng dụng. Bỏ chọn một ứng dụng trước.'); return; }
      state.selected = result.list; drawApp(app, node); view.count.textContent = countText();
    });
    keepVisible(node); drawApp(app, node);
    return node;
  }
  function readApps(done) {
    var options = state.options, config = options.config || {}, tv = options.tv, core = options.core, called = false;
    var exclude = {package: config.package, ids: [config.samsungHome, config.appId]};
    function answer(list) { if (!called) { called = true; done(core.libraryApps(list, exclude)); } }
    function refused() { if (tv) say('TV không cho xem danh sách ứng dụng. Đang hiện các ứng dụng mặc định.'); answer(config.previewLibrary || config.apps); }
    if (!tv || !tv.application || !tv.application.getAppsInfo) { refused(); return; }
    try { tv.application.getAppsInfo(answer, refused); } catch (error) { refused(); }
  }
  function apps() {
    view.title.textContent = 'Ứng dụng trên màn hình chính';
    view.lead.appendChild(document.createTextNode('OK để chọn hoặc bỏ chọn, tối đa ' + maxApps() + '. '));
    view.count = element('span', 'setup-count', countText()); view.count.setAttribute('aria-live', 'polite');
    view.lead.appendChild(view.count);
    var grid = element('div', 'setup-grid'), next = button('Tiếp tục', function () {
      if (!write('cyt-dock-apps', JSON.stringify(orderSelection(state.apps || [], state.selected)))) say('Không lưu được lựa chọn trên TV này.');
      show(3);
    });
    view.body.appendChild(grid); view.actions.appendChild(next);
    state.rows = [[next]]; next.focus();
    var token = state.token;
    function fill(list) {
      if (!state || state.token !== token) return;
      state.apps = list;
      if (!list.length) { grid.appendChild(element('p', 'setup-empty', 'TV chưa trả về ứng dụng nào.')); return; }
      var tiles = list.map(appTile);
      tiles.forEach(function (tile) { grid.appendChild(tile); });
      state.rows = chunk(tiles, COLS).concat([[next]]); tiles[0].focus();
    }
    if (state.apps) fill(state.apps); else readApps(fill);
  }

  // Step 3
  function drawSource(source, node) {
    node.classList.toggle('on', source.dock);
    node.setAttribute('aria-pressed', source.dock ? 'true' : 'false');
  }
  function sourceRow(source) {
    var node = element('button', 'setup-source'), signal = source.connected === true ? 'Đang kết nối'
      : source.connected === false ? 'Không có tín hiệu' : '';
    var named = source.label || source.name;
    node.appendChild(element('i', 'dot' + (source.connected === true ? ' on' : '')));
    node.appendChild(element('span', 'setup-name', named || source.title));
    node.appendChild(element('span', 'setup-port', named ? source.title + (signal ? '  ·  ' + signal : '') : signal));
    node.appendChild(element('span', 'setup-hint', 'Hiện trên màn hình chính'));
    var toggle = element('span', 'setup-switch'); toggle.appendChild(element('i')); node.appendChild(toggle);
    node.setAttribute('aria-label', (source.label || source.name || source.title) + ', ' + source.title + ', hiện trên màn hình chính');
    node.addEventListener('click', function () { source.dock = !source.dock; drawSource(source, node); });
    keepVisible(node); drawSource(source, node);
    return node;
  }
  function readSources(done) {
    var tv = state.options.tv, called = false;
    function answer(value) { if (!called) { called = true; done(value); } }
    if (!tv || !tv.systeminfo) { answer(null); return; }
    try { tv.systeminfo.getPropertyValue('VIDEOSOURCE', answer, function () { answer(null); }); }
    catch (error) { answer(null); }
  }
  function inputs() {
    view.title.textContent = 'Thiết bị HDMI';
    view.lead.textContent = 'OK để hiện hoặc ẩn thiết bị trên màn hình chính. Nguồn vào vẫn có tất cả.';
    var list = element('div', 'setup-list'), next = button('Tiếp tục', function () {
      if (state.sources && !write('cyt-inputs', JSON.stringify(inputsFromSources(state.sources)))) say('Không lưu được lựa chọn trên TV này.');
      show(4);
    });
    view.body.appendChild(list); view.actions.appendChild(next);
    state.rows = [[next]]; next.focus();
    var token = state.token;
    function fill(sources) {
      if (!state || state.token !== token) return;
      state.sources = sources;
      if (!sources.length) { list.appendChild(element('p', 'setup-empty', 'TV chưa báo nguồn HDMI nào.')); return; }
      var rows = sources.map(sourceRow);
      rows.forEach(function (row) { list.appendChild(row); });
      state.rows = rows.map(function (row) { return [row]; }).concat([[next]]); rows[0].focus();
    }
    if (state.sources) fill(state.sources);
    else readSources(function (value) { fill(hdmiSources(value, state.options.inputs)); });
  }

  // Step 4. On the TV, OK on the field should open the on-screen keyboard (not yet verified on a TV).
  function previewText(name) {
    var hello = state.options.hello;
    return hello ? hello(new Date(), name).text : name;
  }
  function family() {
    view.title.textContent = 'Tên gia đình';
    view.lead.textContent = 'Thêm tên vào lời chào trên màn hình chính. Có thể để trống.';
    var field = element('input', 'setup-field');
    field.type = 'text'; field.setAttribute('maxlength', String(GREETING_MAX)); field.setAttribute('autocomplete', 'off');
    field.setAttribute('spellcheck', 'false'); field.setAttribute('aria-label', 'Tên gia đình');
    field.placeholder = 'nhà An Bình'; field.value = state.name;
    var preview = element('p', 'setup-preview', previewText(cleanGreeting(field.value)));
    field.addEventListener('input', function () { state.name = field.value; preview.textContent = previewText(cleanGreeting(field.value)); });
    var done = button('Xong', function () {
      if (!write('cyt-greeting', cleanGreeting(field.value))) say('Không lưu được tên trên TV này.');
      finish();
    }), skip = button('Bỏ qua', finish);
    view.body.appendChild(field); view.body.appendChild(preview);
    view.actions.appendChild(done); view.actions.appendChild(skip);
    view.field = field; view.done = done;
    state.rows = [[field], [done, skip]]; field.focus();
  }

  // Keys while setup is open. app.js routes every keydown here first, so Back never reaches returnHome.
  function onKey(event) {
    if (!state) return;
    var key = typeof event.key === 'string' ? event.key : '', code = event.keyCode, active = document.activeElement;
    var typing = !!view.field && active === view.field;
    if (code === 10009 || key === 'Escape' || key === 'XF86Back') {
      event.preventDefault();
      if (typing) view.done.focus(); // leave the text field first, then step back
      else back();
      return;
    }
    if (typing && (code === 65376 || code === 65385)) { view.done.focus(); return; } // TV keyboard Done / Cancel
    if (key === 'Enter') {
      if (typing) return; // let the TV open its on-screen keyboard
      event.preventDefault();
      if (active && active.click && view.section.contains(active)) active.click();
      return;
    }
    if (key.indexOf('Arrow') !== 0) return;
    if (typing && (key === 'ArrowLeft' || key === 'ArrowRight')) return; // move the caret
    event.preventDefault();
    var rows = state.rows, here = null;
    rows.forEach(function (line, row) { var col = line.indexOf(active); if (col >= 0) here = {row: row, col: col}; });
    if (!here) { if (rows.length && rows[0].length) rows[0][0].focus(); return; }
    var core = state.options.core, to = core.nextFocus(rows, here, key), target = rows[to.row][to.col];
    if (state.options.moveFocus) state.options.moveFocus(target, key); else target.focus();
  }

  return {storedInputs: storedInputs, cleanGreeting: cleanGreeting, greetingName: greetingName, hdmiSources: hdmiSources,
    inputsFromSources: inputsFromSources, toggleSelection: toggleSelection, orderSelection: orderSelection,
    shouldShow: shouldShow, readJson: readJson, storedGreeting: storedGreeting,
    open: open, isOpen: isOpen, onKey: onKey, GREETING_MAX: GREETING_MAX};
}));
