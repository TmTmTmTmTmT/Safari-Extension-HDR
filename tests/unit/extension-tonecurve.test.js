'use strict';
// JS 미러(content/tonecurve.js) vs numpy 참조(sim/export_ref.py) 오차 < 1e-4 (PLAN D-M4 M4-B, GUIDELINES 3-2).
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const repo = path.join(__dirname, '..', '..');
const ref = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'fixtures', 'tonecurve-ref.json'), 'utf8'),
);
const ctx = vm.createContext({});
for (const f of ['ns.js', 'params.js', 'tonecurve.js']) {
  vm.runInContext(fs.readFileSync(path.join(repo, 'extension', 'content', f), 'utf8'), ctx);
}
const tc = ctx.__sdrhdr.tonecurve;
const params = ctx.__sdrhdr.params;
const plain = (v) => JSON.parse(JSON.stringify(v));
const TOL = 1e-4;

test('참조 파일 구조: 프리셋 3종 x 강도 3 x 채도 3, 경계값 포함', () => {
  assert.strictEqual(ref.cases.length, 3 * 3 * 3);
  assert.ok(ref.points.length > 100);
  const has = (p) => ref.points.some((q) => q.every((v, i) => v === p[i]));
  for (const p of [
    [0, 0, 0],
    [1, 1, 1],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
  ])
    assert.ok(has(p), JSON.stringify(p));
  assert.deepStrictEqual([...new Set(ref.cases.map((c) => c.preset))].sort(), [
    'accurate',
    'balanced',
    'vivid',
  ]);
});

test('프리셋 파라미터가 params.js와 참조의 값이 같다', () => {
  for (const c of ref.cases)
    assert.deepStrictEqual(plain(c.params), plain(params.PRESETS[c.preset]));
});

test('itmLinearStrength + saturateP3: numpy 참조와 오차 < 1e-4', () => {
  let worst = 0;
  for (const c of ref.cases) {
    ref.points.forEach((pt, i) => {
      const out = tc.saturateP3(tc.itmLinearStrength(pt, c.strength, c.params), c.csat);
      for (let j = 0; j < 3; j++) {
        const e = Math.abs(out[j] - c.out[i][j]);
        worst = Math.max(worst, e);
        assert.ok(
          e < TOL,
          `${c.preset} t=${c.strength} cs=${c.csat} pt=${JSON.stringify(pt)} ch=${j}: ${out[j]} vs ${c.out[i][j]}`,
        );
      }
    });
  }
  assert.ok(worst < TOL);
});

test('sharpenPixel: numpy 참조와 오차 < 1e-4, 상수 일치', () => {
  const s = ref.sharpen;
  assert.strictEqual(tc.SHARP_GAIN, s.gain);
  assert.strictEqual(tc.SHARP_LIMIT, s.limit);
  for (const c of s.cases) {
    s.center.forEach((ctr, i) => {
      const [n, so, e, w] = s.neighbors[i];
      const out = tc.sharpenPixel(ctr, n, so, e, w, c.sharp);
      for (let j = 0; j < 3; j++)
        assert.ok(Math.abs(out[j] - c.out[i][j]) < TOL, `sharp=${c.sharp} i=${i}`);
    });
  }
});

test('계수가 numpy 참조와 같다: P3 휘도, 709 휘도', () => {
  assert.deepStrictEqual(
    plain(tc.LUMA_P3).map((v) => Math.round(v * 1e9)),
    ref.luma_p3.map((v) => Math.round(v * 1e9)),
  );
});

test('성질: 강도 0은 색 변환만, 채도 1·선명도 0은 항등, 피크 = 1 + t(P-1)', () => {
  const p = params.PRESETS.balanced;
  const white = [1, 1, 1];
  const t0 = tc.itmLinearStrength([0.5, 0.4, 0.3], 0, p);
  const idm = tc.itmLinearStrength([0.5, 0.4, 0.3], 0, { ...p, P: 8, k: 0.4 });
  for (let i = 0; i < 3; i++) assert.ok(Math.abs(t0[i] - idm[i]) < 1e-12);
  const peak = tc.itmLinearStrength(white, 0.45, p);
  assert.ok(Math.abs(peak[1] - (1 + 0.45 * (p.P - 1))) < 1e-6);
  const c = [0.2, 0.5, 0.9];
  assert.deepStrictEqual(plain(tc.sharpenPixel(c, c, c, c, c, 0)), c);
  const sat = tc.saturateP3([0.3, 0.6, 1.2], 1);
  assert.deepStrictEqual(plain(sat), [0.3, 0.6, 1.2]);
});
