'use strict';
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ext = path.join(__dirname, '..', '..', 'extension', 'content');
const fixture = (name) => pathToFileURL(path.join(__dirname, 'fixtures', name)).href;

async function open(page, name) {
  await page.goto(fixture(name));
  await page.addScriptTag({ path: path.join(ext, 'ns.js') });
  await page.addScriptTag({ path: path.join(ext, 'detect.js') });
}

test('findMainVideo: 최소 픽스처에서 video와 container를 찾는다', async ({ page }) => {
  await open(page, 'm2-player.html');
  const r = await page.evaluate(() => {
    const found = globalThis.__sdrhdr.detect.findMainVideo(document);
    return (
      found && {
        videoTag: found.video.tagName,
        videoIsMain: found.video.classList.contains('html5-main-video'),
        containerClass: found.container.className,
        videoInContainer: found.container.contains(found.video),
      }
    );
  });
  expect(r).toEqual({
    videoTag: 'VIDEO',
    videoIsMain: true,
    containerClass: 'html5-video-container',
    videoInContainer: true,
  });
});

test('findMainVideo: 셀렉터 누락 픽스처에서 예외 없이 null', async ({ page }) => {
  await open(page, 'm2-no-video.html');
  const r = await page.evaluate(() => globalThis.__sdrhdr.detect.findMainVideo(document));
  expect(r).toBeNull();
});

test('findMainVideo: 빈 문서에서도 null', async ({ page }) => {
  await page.goto('about:blank');
  await page.addScriptTag({ path: path.join(ext, 'ns.js') });
  await page.addScriptTag({ path: path.join(ext, 'detect.js') });
  const r = await page.evaluate(() => globalThis.__sdrhdr.detect.findMainVideo(document));
  expect(r).toBeNull();
});
