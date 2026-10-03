'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const repo = path.join(__dirname, '..', '..');
const extDir = path.join(repo, 'extension', 'popup', 'icons');
const appDir = path.join(
  repo,
  'xcode',
  'SDRHDR',
  'SDRHDR',
  'Assets.xcassets',
  'AppIcon.appiconset',
);

function header(file) {
  const b = fs.readFileSync(file);
  assert.strictEqual(b.subarray(0, 8).toString('hex'), '89504e470d0a1a0a', file);
  return { b, w: b.readUInt32BE(16), h: b.readUInt32BE(20), depth: b[24], ctype: b[25] };
}

// RGBA 8비트 PNG 디코드 (make-icons.py는 필터 0만 사용)
function decode(file) {
  const { b, w, h } = header(file);
  const parts = [];
  for (let o = 8; o < b.length;) {
    const len = b.readUInt32BE(o);
    if (b.toString('latin1', o + 4, o + 8) === 'IDAT') parts.push(b.subarray(o + 8, o + 8 + len));
    o += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(parts));
  const px = Buffer.alloc(w * h * 4);
  for (let y = 0; y < h; y++) {
    assert.strictEqual(raw[y * (w * 4 + 1)], 0);
    raw.copy(px, y * w * 4, y * (w * 4 + 1) + 1, (y + 1) * (w * 4 + 1));
  }
  return { px, w, h };
}

test('icons: 확장 PNG 전부 RGBA, 크기가 파일명과 일치', () => {
  const files = fs.readdirSync(extDir).filter((f) => f.endsWith('.png'));
  assert.strictEqual(files.length, 14);
  for (const f of files) {
    const n = Number(/(\d+)\.png$/.exec(f)[1]);
    const hd = header(path.join(extDir, f));
    assert.deepStrictEqual([hd.w, hd.h, hd.depth, hd.ctype], [n, n, 8, 6], f);
  }
});

test('icons: AppIcon Contents.json filename 존재와 size×scale 픽셀 일치', () => {
  const c = JSON.parse(fs.readFileSync(path.join(appDir, 'Contents.json'), 'utf8'));
  assert.strictEqual(c.images.length, 10);
  for (const img of c.images) {
    assert.ok(img.filename, JSON.stringify(img));
    const px = parseInt(img.size, 10) * parseInt(img.scale, 10);
    const hd = header(path.join(appDir, img.filename));
    assert.deepStrictEqual([hd.w, hd.h, hd.ctype], [px, px, 6], img.filename);
  }
});

test('icons: Resources/Icon.png는 256px RGBA', () => {
  const hd = header(path.join(repo, 'xcode', 'SDRHDR', 'SDRHDR', 'Resources', 'Icon.png'));
  assert.deepStrictEqual([hd.w, hd.h, hd.ctype], [256, 256, 6]);
});

test('icons: 512px는 불투명 영역이 넓고 좌우 밝기가 다르며 곡선(흰색)이 있음', () => {
  const { px, w, h } = decode(path.join(extDir, 'icon-512.png'));
  let opaque = 0;
  let white = 0;
  let sumL = 0;
  let sumR = 0;
  let nL = 0;
  let nR = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (px[i + 3] === 0) continue;
      opaque++;
      if (px[i] > 250 && px[i + 1] > 250 && px[i + 2] > 250) white++;
      const lum = (px[i] + px[i + 1] + px[i + 2]) / 3;
      if (x < w / 2) ((sumL += lum), nL++);
      else ((sumR += lum), nR++);
    }
  }
  assert.ok(opaque / (w * h) > 0.5);
  assert.ok(white / (w * h) > 0.02, '곡선');
  assert.ok(Math.abs(sumR / nR - sumL / nL) > 10);
});

test('icons: 꺼짐 변형은 켜짐과 바이트가 다르고 채도가 없음', () => {
  const on = decode(path.join(extDir, 'icon-32.png'));
  const off = decode(path.join(extDir, 'icon-off-32.png'));
  assert.notDeepStrictEqual(on.px, off.px);
  for (let i = 0; i < off.px.length; i += 4) {
    if (off.px[i + 3] === 0) continue;
    assert.ok(Math.abs(off.px[i] - off.px[i + 2]) <= 6);
  }
});
