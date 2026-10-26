const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../launcher/core.js');

test('D-pad does not wrap at edges', () => {
  const rows = [[1,2,3],[4,5,6,7,8]];
  assert.deepEqual(core.nextFocus(rows,{row:1,col:4},'ArrowRight'),{row:1,col:4});
  assert.deepEqual(core.nextFocus(rows,{row:0,col:0},'ArrowLeft'),{row:0,col:0});
  assert.deepEqual(core.nextFocus(rows,{row:0,col:2},'ArrowUp'),{row:0,col:2});
});
test('unequal row lengths and last partial row stay focusable', () => {
  assert.deepEqual(core.nextFocus([[1,2],[3,4,5],[6]],{row:1,col:2},'ArrowUp'),{row:0,col:1});
  assert.deepEqual(core.nextFocus([[1,2],[3,4,5],[6]],{row:1,col:2},'ArrowDown'),{row:2,col:0});
});
test('saved order ignores removed apps and duplicate IDs', () => {
  assert.deepEqual(core.orderApps([{id:'a'},{id:'b'},{id:'c'}],['b','gone','b']).map(a=>a.id),['b','a','c']);
});
test('corrupt persisted state falls back without losing apps', () => {
  assert.deepEqual(core.orderApps([{id:'a'}],{}),[{id:'a'}]);
});
test('prototype-shaped IDs are treated as data', () => {
  assert.deepEqual(core.orderApps([{id:'__proto__'},{id:'constructor'}],['constructor']).map(a=>a.id),['constructor','__proto__']);
});
test('successful launch uses the public Tizen API', () => {
  let actual, success=false;
  core.launch({application:{launch(id, ok){actual=id;ok();}}},'test.App',()=>success=true,()=>assert.fail());
  assert.equal(actual,'test.App'); assert.ok(success);
});
test('missing or blocked apps remain recoverable', () => {
  for (const api of [null,{application:{launch(){throw new Error('denied');}}},
    {application:{launch(id,ok,fail){fail();}}}]) {
    let message; core.launch(api,'test.App',()=>assert.fail(),m=>message=m); assert.ok(message);
  }
});
test('invalid IDs never reach the API', () => {
  let message; core.launch({application:{launch(){assert.fail();}}},'bad;cmd',()=>assert.fail(),m=>message=m);
  assert.ok(message);
});
test('launcher does not intercept power/home or run a background watchdog', () => {
  const app=fs.readFileSync(path.join(__dirname,'../launcher/app.js'),'utf8');
  assert.ok(!app.includes('registerKey('));
  assert.ok(!app.includes('10252')); // Power key must remain Samsung-owned.
  assert.ok(!app.includes('setInterval(openApp'));
  assert.ok(!app.includes('innerHTML'));
});
