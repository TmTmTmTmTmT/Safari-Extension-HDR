'use strict';
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ext = path.join(__dirname, '..', '..', 'extension', 'content');
const fixture = (name) => pathToFileURL(path.join(__dirname, 'fixtures', name)).href;

async function open(page, name) {
  await page.goto(fixture(name));
  for (const f of ['ns.js', 'detect.js', 'params.js', 'hud.js']) {
    await page.addScriptTag({ path: path.join(ext, f) });
  }
}

test('createChip: container 바로 뒤 형제, 컨트롤 앞, pointer-events none, z-index 없음, 우상단', async ({
  page,
}) => {
  await open(page, 'yt-default.html');
  const r = await page.evaluate(() => {
    const found = globalThis.__sdrhdr.detect.findMainVideo(document);
    const controls = document.querySelector('.ytp-chrome-bottom');
    const chip = globalThis.__sdrhdr.hud.createChip(found.container);
    const el = found.container.nextElementSibling;
    const before = getComputedStyle(el).display;
    chip.show('HDR 변환 중', 5000);
    const cs = getComputedStyle(el);
    const out = {
      sibling: !!el && el.parentNode === found.container.parentNode,
      beforeControls: !!(el.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING),
      pe: cs.pointerEvents,
      zIndex: cs.zIndex,
      position: cs.position,
      right: el.style.right,
      top: el.style.top,
      hiddenBefore: before,
      shown: cs.display,
      text: el.textContent,
    };
    chip.destroy();
    chip.destroy();
    out.removed = !el.isConnected;
    return out;
  });
  expect(r.sibling).toBe(true);
  expect(r.beforeControls).toBe(true);
  expect(r.pe).toBe('none');
  expect(r.zIndex).toBe('auto');
  expect(r.position).toBe('absolute');
  expect(r.right).toBe('8px');
  expect(r.top).toBe('8px');
  expect(r.hiddenBefore).toBe('none');
  expect(r.shown).toBe('block');
  expect(r.text).toBe('HDR 변환 중');
  expect(r.removed).toBe(true);
});

test('createChip: show 후 지정 시간이 지나면 숨기고 내용을 비운다', async ({ page }) => {
  await open(page, 'yt-default.html');
  await page.evaluate(() => {
    const found = globalThis.__sdrhdr.detect.findMainVideo(document);
    globalThis.__chip = globalThis.__sdrhdr.hud.createChip(found.container);
    globalThis.__chip.show('꺼짐', 100);
  });
  const el = page.locator('.html5-video-container + div');
  await expect(el).toHaveText('꺼짐');
  await expect(el).toBeHidden({ timeout: 2000 });
  await expect(el).toHaveText('');
});

test('HUD와 칩은 서로 다른 형제 요소이고 둘 다 container 뒤에 있다', async ({ page }) => {
  await open(page, 'yt-default.html');
  const r = await page.evaluate(() => {
    const { detect, hud } = globalThis.__sdrhdr;
    const { container } = detect.findMainVideo(document);
    const h = hud.createHud(container);
    const c = hud.createChip(container);
    h.update(hud.hudLines({ state: 'skipped', skipReason: 'drm', drmNow: true }));
    c.show('DRM 영상: 변환하지 않음');
    const sibs = [...container.parentNode.children];
    const i = sibs.indexOf(container);
    return {
      n: sibs.length,
      distinct: sibs[i + 1] !== sibs[i + 2],
      pe: [sibs[i + 1], sibs[i + 2]].map((e) => getComputedStyle(e).pointerEvents),
      line1: [sibs[i + 1], sibs[i + 2]].map((e) => e.textContent.split('\n')[0]),
    };
  });
  expect(r.distinct).toBe(true);
  expect(r.pe).toEqual(['none', 'none']);
  expect(r.line1.some((t) => t.startsWith('DRM 영상: 변환하지 않음 (drm)  경로 -'))).toBe(true);
});
