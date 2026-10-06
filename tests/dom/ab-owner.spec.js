'use strict';
// FIX_GUIDE AB1: 같은 문서에 다른 사본의 소유 표지가 있으면 content 묶음이 캔버스를 만들지 않는다.
// Playwright WebKit 페이지이며 Safari 확장 격리 세계·WebGPU 동작 검증이 아니다.
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');

const root = path.join(__dirname, '..', '..', 'extension');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const fixture = (name) => pathToFileURL(path.join(__dirname, 'fixtures', name)).href;
const ATTR = 'data-sdrhdr-owner';

async function run(page, preset) {
  // browser 스텁: 켜진 기본 설정, 메시지·저장 변경 없음.
  await page.addInitScript(() => {
    globalThis.browser = {
      storage: {
        local: { get: async () => ({}), set: async () => {} },
        onChanged: { addListener() {}, removeListener() {} },
      },
      runtime: { sendMessage: async () => {}, onMessage: { addListener() {} } },
    };
  });
  await page.goto(fixture('yt-default.html'));
  await page.evaluate(
    ([attr, value]) => {
      if (value) document.documentElement.setAttribute(attr, value);
      globalThis.__canvasAdded = 0;
      new MutationObserver((recs) => {
        for (const r of recs)
          for (const n of r.addedNodes) {
            if (n.nodeName === 'CANVAS') globalThis.__canvasAdded += 1;
          }
      }).observe(document, { childList: true, subtree: true });
    },
    [ATTR, preset],
  );
  for (const f of manifest.content_scripts[0].js) {
    await page.addScriptTag({ path: path.join(root, f) });
  }
  await page.waitForTimeout(600);
  return page.evaluate(
    (attr) => ({
      owner: document.documentElement.getAttribute(attr),
      canvasAdded: globalThis.__canvasAdded,
      canvasNow: document.querySelectorAll('canvas').length,
    }),
    ATTR,
  );
}

test('다른 토큰의 소유 표지가 있으면 캔버스를 만들지 않고 표지도 건드리지 않는다', async ({
  page,
}) => {
  const r = await run(page, 'another-copy-token');
  expect(r.owner).toBe('another-copy-token');
  expect(r.canvasAdded).toBe(0);
  expect(r.canvasNow).toBe(0);
});

test('표지가 없으면 자기 토큰을 쓰고 overlay 캔버스를 만든다(대조군)', async ({ page }) => {
  const r = await run(page, '');
  expect(r.owner).toBeTruthy();
  expect(r.owner).not.toBe('another-copy-token');
  expect(r.canvasAdded).toBeGreaterThan(0);
});
