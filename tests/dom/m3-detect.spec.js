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

// 실제 YouTube DOM 스냅샷 픽스처 (PLAN M3-8 D4·D5). 극장 속성과 HDR 배지는 스냅샷으로 확인되지 않은 상태를 고정한다.
for (const name of ['yt-default.html', 'yt-theater.html', 'yt-hdr-settings.html']) {
  test('실제 스냅샷 ' + name + ': video·container·player를 찾는다', async ({ page }) => {
    await open(page, name);
    const r = await page.evaluate(() => {
      const f = globalThis.__sdrhdr.detect.findMainVideo(document);
      return (
        f && {
          video: f.video.className,
          container: f.container.className,
          player: f.player.id,
          inContainer: f.container.contains(f.video),
        }
      );
    });
    expect(r).toEqual({
      video: 'video-stream html5-main-video',
      container: 'html5-video-container',
      player: 'movie_player',
      inContainer: true,
    });
  });

  test('실제 스냅샷 ' + name + ': 광고·HDR 배지 false, 전체화면 false', async ({ page }) => {
    await open(page, name);
    const r = await flags(page);
    expect(r.ad).toBe(false);
    expect(r.f.adShowing).toBe(false);
    expect(r.f.hdrBadge).toBe(false); // HDR 영상(yt-hdr-settings)에서도 4k 배지 클래스뿐이라 DOM으로는 구분 불가 (O5)
    expect(r.f.isFullscreen).toBe(false);
  });
}

test('[미확인] 조상 미포함: 극장 스냅샷에서도 playerMode가 default (현재 한계 고정)', async ({
  page,
}) => {
  await open(page, 'yt-theater.html');
  const r = await flags(page);
  expect(r.f.isTheater).toBe(false);
  expect(r.mode).toBe('default');
});
