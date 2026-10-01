'use strict';
(function () {
  // PLAN C절 프리셋 표 (2026-10-01 M4 확정, D-M4 M4-A2). ASCII id로 저장하고 popup이 한글 이름을 붙인다.
  const PRESETS = {
    accurate: { P: 2.0, k: 0.5, n: 2.0, g: 1.0, s: 1.0, hs: 1.0 },
    balanced: { P: 3.0, k: 0.45, n: 2.0, g: 1.0, s: 1.0, hs: 1.0 },
    vivid: { P: 4.0, k: 0.45, n: 2.0, g: 1.0, s: 1.2, hs: 1.0 },
  };
  const PRESET_IDS = Object.keys(PRESETS);
  const DEFAULT_PRESET = 'balanced';
  const PRESET_BALANCED = PRESETS.balanced;

  // PLAN C절 파라미터 범위 [min, max]. 범위 정의는 이 한 곳 (GUIDELINES 3-5).
  const RANGES = {
    P: [1.0, 8.0],
    k: [0.4, 0.9],
    n: [1.5, 4],
    g: [0.8, 1.5],
    s: [0.8, 1.5],
    hs: [0.5, 1.5],
  };

  // baseline은 진단용: 캔버스를 숨기고 rAF 루프만 돈다 (FIX_GUIDE S1, GUIDELINES 2.6-3).
  const MODES = ['itm', 'identity', 'stripes', 'baseline'];
  const KEYS = {
    enabled: 'sdrhdr.enabled',
    mode: 'sdrhdr.mode',
    preset: 'sdrhdr.preset',
    strength: 'sdrhdr.strength',
    sharpness: 'sdrhdr.sharpness',
    saturation: 'sdrhdr.saturation',
    diag: 'sdrhdr.diag',
  };
  // 슬라이더 범위·기본값 (PLAN D-M4a, M4-E). 강도 0 = 색 변환만, 1 = ITM 전체. 기본 0.45는 M4a 사용자 회신으로 확정.
  const STRENGTH = { min: 0, max: 1, step: 0.01, default: 0.45 };
  const SHARPNESS = { min: 0, max: 1, step: 0.01, default: 0 };
  const SATURATION = { min: 0.5, max: 1.5, step: 0.01, default: 1.0 };
  const DEFAULTS = {
    enabled: true,
    mode: 'itm',
    preset: DEFAULT_PRESET,
    strength: STRENGTH.default,
    sharpness: SHARPNESS.default,
    saturation: SATURATION.default,
  };

  // 셰이더 uniform(ItmParams) 필드 순서. WGSL 구조체와 renderer 직렬화가 이 순서를 따른다 (PLAN M4-B).
  const UNIFORM_ORDER = ['strength', 'P', 'k', 'n', 'g', 's', 'hs', 'sharp', 'csat'];
  const UNIFORM_FLOATS = 12; // 48바이트, 16바이트 정렬을 위해 패딩 3개

  // 순수: 숫자가 아니면 기본값, 범위 밖은 클램프, step 단위로 반올림.
  function normalizeRange(spec, v) {
    if (typeof v !== 'number' || !Number.isFinite(v)) return spec.default;
    const c = Math.min(spec.max, Math.max(spec.min, v));
    const inv = Math.round(1 / spec.step);
    return Math.round(c * inv) / inv;
  }
  const normalizeStrength = (v) => normalizeRange(STRENGTH, v);

  // 순수: storage 원본 객체(저장 키 기준) -> 유효한 설정. 잘못된 값은 기본값.
  function normalizeSettings(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const enabled = r[KEYS.enabled];
    const mode = r[KEYS.mode];
    const preset = r[KEYS.preset];
    return {
      enabled: typeof enabled === 'boolean' ? enabled : DEFAULTS.enabled,
      mode: MODES.includes(mode) ? mode : DEFAULTS.mode,
      preset: PRESET_IDS.includes(preset) ? preset : DEFAULT_PRESET,
      strength: normalizeRange(STRENGTH, r[KEYS.strength]),
      sharpness: normalizeRange(SHARPNESS, r[KEYS.sharpness]),
      saturation: normalizeRange(SATURATION, r[KEYS.saturation]),
    };
  }

  // 순수: 설정 -> uniform 배열(UNIFORM_FLOATS개 숫자). renderer가 writeBuffer로 그대로 쓴다.
  function toUniformArray(settings) {
    const s = settings || {};
    const p = PRESETS[s.preset] || PRESETS[DEFAULT_PRESET];
    const vals = {
      strength: normalizeRange(STRENGTH, s.strength),
      P: p.P,
      k: p.k,
      n: p.n,
      g: p.g,
      s: p.s,
      hs: p.hs,
      sharp: normalizeRange(SHARPNESS, s.sharpness),
      csat: normalizeRange(SATURATION, s.saturation),
    };
    const out = UNIFORM_ORDER.map((name) => vals[name]);
    while (out.length < UNIFORM_FLOATS) out.push(0);
    return out;
  }

  const SETTING_KEYS = [
    KEYS.enabled,
    KEYS.mode,
    KEYS.preset,
    KEYS.strength,
    KEYS.sharpness,
    KEYS.saturation,
  ];

  // 아래 함수는 호출 시점에만 browser.storage에 접근한다.
  async function readSettings() {
    const raw = await browser.storage.local.get(SETTING_KEYS);
    return normalizeSettings(raw);
  }

  // 설정 키 변경 시 cb(설정)를 호출한다. 반환값은 구독 해제 함수.
  function subscribe(cb) {
    const listener = (changes, area) => {
      if (area !== 'local') return;
      if (!SETTING_KEYS.some((k) => k in changes)) return;
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
    PRESETS,
    PRESET_IDS,
    DEFAULT_PRESET,
    PRESET_BALANCED,
    RANGES,
    MODES,
    KEYS,
    DEFAULTS,
    STRENGTH,
    SHARPNESS,
    SATURATION,
    UNIFORM_ORDER,
    UNIFORM_FLOATS,
    normalizeRange,
    normalizeStrength,
    normalizeSettings,
    toUniformArray,
    readSettings,
    subscribe,
    writeDiag,
  };
})();
