'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const ctx = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root, 'content', 'ns.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'content', 'detect.js'), 'utf8'), ctx);
// vm 컨텍스트의 객체는 prototype이 달라 deepStrictEqual이 실패하므로 JSON으로 복사한다.
const nextLifecycle = (st, ev) =>
  JSON.parse(JSON.stringify(ctx.__sdrhdr.detect.nextLifecycle(st, ev)));

const S = (state, skip) => ({ state, skip: skip || null });
const run = (start, evs) => evs.reduce((st, ev) => nextLifecycle(st, ev), start);

test('상태 전이 표', () => {
  const table = [
    [S('idle'), 'attach', S('probing')],
    [S('probing'), 'decided', S('active')],
    [S('active'), 'srcChange', S('probing')],
    [S('probing'), 'srcChange', S('probing')],
    [S('idle'), 'srcChange', S('idle')],
    [S('active'), 'drm', S('skipped', 'drm')],
    [S('active'), 'black', S('skipped', 'blackFrame')],
    [S('probing'), 'hdr', S('skipped', 'hdrSource')],
    [S('active'), 'pipEnter', S('skipped', 'pip')],
    [S('skipped', 'pip'), 'pipLeave', S('probing')],
    [S('active'), 'pipLeave', S('active')],
    [S('active'), 'error', S('skipped', 'noGpu')],
    [S('active'), 'disable', S('skipped', 'disabled')],
    [S('skipped', 'disabled'), 'enable', S('idle')],
    [S('active'), 'videoGone', S('idle')],
    [S('active'), 'unknown', S('active')],
  ];
  for (const [from, ev, to] of table) {
    assert.deepStrictEqual(nextLifecycle(from, ev), to, JSON.stringify(from) + ' + ' + ev);
  }
});

test('DRM 소스 → skipped(drm), 다음 소스·pip·attach 후에도 유지', () => {
  const st = run(S('active'), ['drm', 'srcChange', 'srcChange', 'pipEnter', 'pipLeave', 'attach']);
  assert.deepStrictEqual(st, S('skipped', 'drm'));
  assert.deepStrictEqual(nextLifecycle(st, 'disable'), S('skipped', 'drm'));
  assert.deepStrictEqual(nextLifecycle(st, 'error'), S('skipped', 'drm'));
});

test('blackFrame·hdrSource는 다음 소스에서 probing으로 재판정', () => {
  assert.deepStrictEqual(run(S('active'), ['black', 'srcChange']), S('probing'));
  assert.deepStrictEqual(run(S('active'), ['hdr', 'srcChange']), S('probing'));
});

test('skip 상태에서 black·hdr·decided는 무시', () => {
  assert.deepStrictEqual(run(S('active'), ['hdr', 'black', 'decided']), S('skipped', 'hdrSource'));
});

test('PiP 중 소스 변경은 pip 유지, 해제 시 probing', () => {
  assert.deepStrictEqual(run(S('active'), ['pipEnter', 'srcChange']), S('skipped', 'pip'));
  assert.deepStrictEqual(run(S('active'), ['pipEnter', 'srcChange', 'pipLeave']), S('probing'));
});

test('입력 상태 객체를 바꾸지 않는다', () => {
  const st = S('active');
  nextLifecycle(st, 'drm');
  assert.deepStrictEqual(st, S('active'));
});
