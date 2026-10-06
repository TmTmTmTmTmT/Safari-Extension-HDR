'use strict';
// 앱 점검 화면(xcode/SDRHDR/SDRHDR/Resources) 렌더·메시지 테스트 (FIX_GUIDE W4).
const { test, expect } = require('@playwright/test');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const page_url = pathToFileURL(
  path.join(
    __dirname,
    '..',
    '..',
    'xcode',
    'SDRHDR',
    'SDRHDR',
    'Resources',
    'Base.lproj',
    'Main.html',
  ),
).href;

const base = {
  signed: true,
  selfVersion: '1.3.2',
  firstRun: false,
  versionChanged: false,
  selfIsNewest: true,
  ambiguous: false,
  newestOtherIndex: null,
  copies: [],
  extEnabled: true,
  youtubeConfirmed: true,
  notice: null,
};

async function open(page, state) {
  await page.addInitScript(() => {
    window.__sent = [];
    window.webkit = window.webkit || {};
    window.webkit.messageHandlers = { controller: { postMessage: (m) => window.__sent.push(m) } };
  });
  await page.goto(page_url);
  await page.evaluate((s) => render(s), state);
}

const marks = (page) =>
  page.$$eval('#steps .step', (els) => els.map((e) => e.className.replace('step ', '')));

test('전부 정상: 4항목 모두 ok/시작하기', async ({ page }) => {
  await open(page, base);
  expect(await marks(page)).toEqual(['ok', 'ok', 'ok', 'ok']);
  expect(await page.textContent('#done')).toBe('시작하기');
  expect(await page.textContent('#title')).toBe('SDR HDR 상태');
});

test('처음 실행·서명 없음·확장 꺼짐: 조치 필요, 버튼 메시지', async ({ page }) => {
  await open(page, {
    ...base,
    firstRun: true,
    signed: false,
    extEnabled: false,
    youtubeConfirmed: false,
  });
  expect(await marks(page)).toEqual(['todo', 'ok', 'todo', 'manual']);
  expect(await page.textContent('#title')).toBe('SDR HDR 처음 설정');
  expect(await page.textContent('#done')).toBe('나중에 하고 닫기');
  await page.click('text=Safari 확장 설정 열기');
  await page.check('input[type=checkbox]');
  await page.click('#done');
  expect(await page.evaluate(() => window.__sent)).toEqual([
    'open-preferences',
    'youtube:1',
    'done',
  ]);
});

test('사본 2개·자기가 최신: 휴지통/Finder 버튼, 경로는 id로만 전달', async ({ page }) => {
  const copies = [
    {
      id: 0,
      path: '/Applications/SDRHDR.app',
      version: '1.0.1',
      builtAt: '2026-10-01T05:53:17Z',
      signing: 'adhoc',
    },
  ];
  await open(page, { ...base, copies });
  expect(await marks(page)).toEqual(['ok', 'todo', 'ok', 'ok']);
  await page.click('text=휴지통으로 이동');
  await page.click('text=Finder에서 보기');
  expect(await page.evaluate(() => window.__sent)).toEqual(['trash:0', 'reveal:0']);
  expect(await page.textContent('.copy .path')).toBe('/Applications/SDRHDR.app');
});

test('사본 2개·자기가 최신 아님: 삭제 버튼 없음, 최신 사본 열기', async ({ page }) => {
  const copies = [
    { id: 0, path: '/x/SDRHDR.app', version: '1.3.2', builtAt: null, signing: 'signed' },
  ];
  await open(page, { ...base, selfIsNewest: false, newestOtherIndex: 0, copies });
  expect(await page.$$eval('button', (b) => b.map((x) => x.textContent))).toEqual([
    '최신 사본 열기',
    'Finder에서 보기',
    '나중에 하고 닫기',
  ]);
  await page.click('text=최신 사본 열기');
  expect(await page.evaluate(() => window.__sent)).toEqual(['open-newest']);
});

test('더 새롭지만 서명 팀 확인 불가: 열기 버튼 없이 Finder 보기만', async ({ page }) => {
  const copies = [
    { id: 0, path: '/x/SDRHDR.app', version: '9.9.9', builtAt: null, signing: 'unknown' },
  ];
  await open(page, {
    ...base,
    selfIsNewest: false,
    newestOtherIndex: null,
    newestUnverified: true,
    copies,
  });
  expect(await page.$$eval('button', (b) => b.map((x) => x.textContent))).toEqual([
    'Finder에서 보기',
    '나중에 하고 닫기',
  ]);
  expect(await page.textContent('#steps')).toContain('같은 개발자 서명인지 확인할 수 없습니다');
});

test('서명 확인 문구: 미서명 허용은 꺼 두라고 안내', async ({ page }) => {
  await open(page, base);
  const t = await page.textContent('#steps');
  expect(t).toContain('꺼 두세요');
  expect(t).toContain('다른 확장도 로드될 수 있습니다');
});

test('판정 불가: 삭제·열기 없이 Finder 보기만', async ({ page }) => {
  const copies = [
    { id: 0, path: '/x/SDRHDR.app', version: null, builtAt: null, signing: 'unknown' },
  ];
  await open(page, { ...base, selfIsNewest: false, ambiguous: true, copies });
  expect(await page.$$eval('button', (b) => b.map((x) => x.textContent))).toEqual([
    'Finder에서 보기',
    '나중에 하고 닫기',
  ]);
});

test('notice 표시, 경로의 HTML은 텍스트로만 렌더', async ({ page }) => {
  const copies = [
    { id: 0, path: '/x/<b>y</b>.app', version: null, builtAt: null, signing: 'unknown' },
  ];
  await open(page, {
    ...base,
    notice: '이전 사본을 휴지통으로 옮겼습니다.',
    selfIsNewest: false,
    copies,
  });
  expect(await page.isVisible('#notice')).toBe(true);
  expect(await page.textContent('.copy .path')).toBe('/x/<b>y</b>.app');
  expect(await page.$$('.copy .path b')).toHaveLength(0);
});
