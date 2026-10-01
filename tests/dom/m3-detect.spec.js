'use strict';
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ext = path.join(__dirname, '..', '..', 'extension', 'content');
const fixture = (name) => pathToFileURL(path.join(__dirname, 'fixtures', name)).href;

async function open(page, name) {
  await page.goto(name ? fixture(name) : 'about:blank');
  await page.addScriptTag({ path: path.join(ext, 'ns.js') });
  await page.addScriptTag({ path: path.join(ext, 'detect.js') });
}

const flags = (page) =>
  page.evaluate(() => {
    const d = globalThis.__sdrhdr.detect;
    const f = d.readPlayerFlags(document);
    return { f, mode: d.playerMode(f), ad: d.isAdShowing(document) };
  });

test('readPlayerFlags: 기본 픽스처는 모두 false, mode default', async ({ page }) => {
  await open(page, 'm3-default.html');
  const r = await flags(page);
  expect(r.f).toEqual({
    isTheater: false,
    isMiniplayer: false,
    isFullscreen: false,
    adShowing: false,
    hdrBadge: false,
  });
  expect(r.mode).toBe('default');
  expect(r.ad).toBe(false);
});

test('readPlayerFlags: 광고·극장·HDR 배지 픽스처', async ({ page }) => {
  await open(page, 'm3-ad-theater-hdr.html');
  const r = await flags(page);
  expect(r.f).toEqual({
    isTheater: true,
    isMiniplayer: false,
    isFullscreen: false,
    adShowing: true,
    hdrBadge: true,
  });
  expect(r.mode).toBe('theater');
  expect(r.ad).toBe(true);
});

test('playerMode: 전체화면 플래그가 극장보다 우선', async ({ page }) => {
  await open(page, 'm3-ad-theater-hdr.html');
  const r = await page.evaluate(() => {
    const d = globalThis.__sdrhdr.detect;
    return d.playerMode({ ...d.readPlayerFlags(document), isFullscreen: true });
  });
  expect(r).toBe('fullscreen');
});

test('플레이어 없는 문서에서도 예외 없이 false', async ({ page }) => {
  await open(page, null);
  const r = await flags(page);
  expect(r.ad).toBe(false);
  expect(r.mode).toBe('default');
  expect(r.f.hdrBadge).toBe(false);
});
