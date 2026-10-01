'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));

function load() {
  const ctx = vm.createContext({});
  for (const f of manifest.content_scripts[0].js) {
    vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
  }
  return ctx.__sdrhdr;
}
const { detect } = load();

test('M3 상수와 기존 export 유지', () => {
  assert.strictEqual(detect.NAV_EVENT, 'yt-navigate-finish');
  assert.deepStrictEqual(Array.from(detect.PIP_EVENTS), [
    'enterpictureinpicture',
    'leavepictureinpicture',
    'webkitpresentationmodechanged',
  ]);
  assert.strictEqual(detect.AD_CLASS, 'ad-showing');
  for (const k of ['isDrm', 'contentRect', 'findMainVideo', 'choosePath', 'SELECTORS']) {
    assert.ok(k in detect, k);
  }
});

test('isHdrSource: 표', () => {
  const { isHdrSource } = detect;
  const cs = (primaries, transfer) => ({ primaries, transfer });
  const cases = [
    [{ frameColorSpace: cs('bt2020', 'pq') }, true],
    [{ frameColorSpace: cs('bt2020', 'hlg') }, true],
    [{ frameColorSpace: cs('bt709', 'pq') }, true],
    [{ frameColorSpace: cs('bt2020', 'bt709') }, false],
    [{ frameColorSpace: cs('bt709', 'bt709') }, false],
    [{ frameColorSpace: cs('bt709', 'bt709'), badge: true }, false],
    [{ badge: true }, true],
    [{ frameColorSpace: null, badge: true }, true],
    [{ frameColorSpace: { primaries: 'bt2020' }, badge: true }, true],
    [{ badge: false }, false],
    [{ badge: 'yes' }, false],
    [{ frameColorSpace: 'pq' }, false],
    [{}, false],
    [undefined, false],
    [null, false],
  ];
  for (const [input, want] of cases) {
    assert.strictEqual(isHdrSource(input), want, JSON.stringify(input));
  }
});

test('playerMode: 우선순위 fullscreen > miniplayer > theater > default', () => {
  const { playerMode } = detect;
  assert.strictEqual(playerMode({}), 'default');
  assert.strictEqual(playerMode(undefined), 'default');
  assert.strictEqual(playerMode({ isTheater: true }), 'theater');
  assert.strictEqual(playerMode({ isMiniplayer: true }), 'miniplayer');
  assert.strictEqual(playerMode({ isFullscreen: true }), 'fullscreen');
  assert.strictEqual(playerMode({ isTheater: true, isMiniplayer: true }), 'miniplayer');
  assert.strictEqual(playerMode({ isFullscreen: true, isMiniplayer: true }), 'fullscreen');
  assert.strictEqual(playerMode({ isFullscreen: true, isTheater: true }), 'fullscreen');
  assert.strictEqual(
    playerMode({ isFullscreen: true, isTheater: true, isMiniplayer: true }),
    'fullscreen',
  );
});

test('isPipActive: 두 신호와 이상값', () => {
  const { isPipActive } = detect;
  const v = { webkitPresentationMode: 'picture-in-picture' };
  assert.strictEqual(isPipActive(v, {}), true);
  assert.strictEqual(isPipActive(v, undefined), true);
  const w = { webkitPresentationMode: 'inline' };
  assert.strictEqual(isPipActive(w, { pictureInPictureElement: w }), true);
  assert.strictEqual(isPipActive(w, { pictureInPictureElement: {} }), false);
  assert.strictEqual(isPipActive(w, null), false);
  assert.strictEqual(isPipActive(null, {}), false);
  assert.strictEqual(isPipActive(undefined, undefined), false);
  const bad = {
    get webkitPresentationMode() {
      throw new Error('x');
    },
  };
  assert.strictEqual(isPipActive(bad, {}), false);
});

test('isAdShowing/readPlayerFlags: 가짜 doc과 예외', () => {
  const player = { classList: { contains: (c) => c === 'ad-showing' } };
  const doc = { querySelector: (s) => (s === '#movie_player' ? player : null) };
  assert.strictEqual(detect.isAdShowing(doc), true);
  const f = detect.readPlayerFlags(doc);
  assert.strictEqual(f.adShowing, true);
  assert.strictEqual(f.isTheater, false);
  assert.strictEqual(f.hdrBadge, false);
  const thrower = {
    querySelector() {
      throw new Error('x');
    },
  };
  assert.strictEqual(detect.isAdShowing(thrower), false);
  assert.strictEqual(detect.isAdShowing(null), false);
  assert.deepStrictEqual(JSON.parse(JSON.stringify(detect.readPlayerFlags(thrower))), {
    isTheater: false,
    isMiniplayer: false,
    isFullscreen: false,
    adShowing: false,
    hdrBadge: false,
  });
  assert.strictEqual(detect.readPlayerFlags(null).isFullscreen, false);
});
