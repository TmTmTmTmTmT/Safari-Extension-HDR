'use strict';
(function () {
  // PLAN C절 균형 프리셋 (M2 고정). 프리셋 수치 변경은 M4.
  const PRESET_BALANCED = { P: 3.0, k: 0.65, n: 2.5, g: 1.0, s: 1.05, hs: 0.95 };

  // PLAN C절 파라미터 범위 [min, max]. 범위 정의는 이 한 곳 (GUIDELINES 3-5).
  const RANGES = {
    P: [1.0, 8.0],
    k: [0.4, 0.9],
    n: [1.5, 4],
    g: [0.8, 1.5],
    s: [0.8, 1.5],
    hs: [0.5, 1.5],
  };

  const MODES = ['itm', 'identity', 'stripes'];
  const KEYS = { enabled: 'sdrhdr.enabled', mode: 'sdrhdr.mode', diag: 'sdrhdr.diag' };
  const DEFAULTS = { enabled: true, mode: 'itm' };

  // 순수: storage 원본 객체(저장 키 기준) -> 유효한 설정. 잘못된 값은 기본값.
  function normalizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const enabled = r[KEYS.enabled];
    const mode = r[KEYS.mode];
    return {
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULTS.enabled,
      mode: MODES.includes(mode) ? mode : DEFAULTS.mode,
    };
  }

  // 아래 함수는 호출 시점에만 browser.storage에 접근한다.
  async function readSettings() {
    const raw = await browser.storage.local.get([KEYS.enabled, KEYS.mode]);
    return normalizeSettings(raw);
  }

  // 설정 키 변경 시 cb(설정)를 호출한다. 반환값은 구독 해제 함수.
  function subscribe(cb) {
    const listener = (changes, area) => {
      if (area !== 'local') return;
      if (!(KEYS.enabled in changes) && !(KEYS.mode in changes)) return;
      readSettings().then(cb, () => {});
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }

  // 최신 진단 1개만 유지 (GUIDELINES 2.6-2).
  function writeDiag(diag) {
    return browser.storage.local.set({ [KEYS.diag]: diag });
  }

  globalThis.__sdrhdr.params = {
    PRESET_BALANCED,
    RANGES,
    MODES,
    KEYS,
    DEFAULTS,
    normalizeSettings,
    readSettings,
    subscribe,
    writeDiag,
  };
})();
