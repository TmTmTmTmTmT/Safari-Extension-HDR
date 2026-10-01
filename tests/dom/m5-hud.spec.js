'use strict';
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ext = path.join(__dirname, '..', '..', 'extension', 'content');
const fixture = (name) => pathToFileURL(path.join(__dirname, 'fixtures', name)).href;

async function open(page, name) {
  await page.goto(fixture(name));
  await page.addScriptTag({ path: path.join(ext, 'ns.js') });
  await page.addScriptTag({ path: path.join(ext, 'hud.js') });
}

test('createHud: container 바로 뒤, 컨트롤 앞, pointer-events none, destroy 제거', async ({
  page,
}) => {
  await open(page, 'yt-default.html');
  const r = await page.evaluate(() => {
    const container = document.querySelector('.html5-video-container');
    const controls = document.querySelector('.ytp-chrome-bottom');
    const hud = globalThis.__sdrhdr.hud.createHud(container);
    hud.update(['a', 'b']);
    const el = container.nextElementSibling;
    const out = {
      sibling: !!el && el.parentNode === container.parentNode,
      beforeControls: !!(el.compareDocumentPosition(controls) & Node.DOCUMENT_POSITION_FOLLOWING),
      pe: getComputedStyle(el).pointerEvents,
      zIndex: getComputedStyle(el).zIndex,
      text: el.textContent,
    };
    hud.destroy();
    hud.destroy();
    out.removed = !el.isConnected && container.nextElementSibling !== el;
    return out;
  });
  expect(r.sibling).toBe(true);
  expect(r.beforeControls).toBe(true);
  expect(r.pe).toBe('none');
  expect(r.zIndex).toBe('auto');
  expect(r.text).toBe('a\nb');
  expect(r.removed).toBe(true);
});
