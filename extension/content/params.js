'use strict';
(function () {
  // PLAN C절 프리셋 표 (2026-10-01 M4 확정, D-M4 M4-A2). ASCII id로 저장하고 popup이 한글 이름을 붙인다.
  const PRESETS = {
    accurate: { P: 2.0, k: 0.5, n: 2.0, g: 1.0, s: 1.0, hs: 1.0 },
    balanced: { P: 3.0, k: 0.45, n: 2.0, g: 1.0, s: 1.0, hs: 1.0 },
    vivid: { P: 4.0, k: 0.45, n: 2.0, g: 1.0, s: 1.2, hs: 1.0 },
  };
  // 'custom'은 상세 슬라이더로 만든 값(sdrhdr.custom)을 쓰는 가상 프리셋이다 (PLAN D-M5 M5-1).
  const PRESET_IDS = Object.keys(PRESETS).concat('custom');
  // 기본 설정은 사용자가 popup에서 맞춘 값이다(2026-10-01 지시): 사용자 지정 프리셋 + 아래 곡선, 강도 43%, 채도 105%.
  const DEFAULT_CUSTOM = { P: 2.0, k: 0.4, n: 2.0, g: 1.22, s: 1.03, hs: 1.03 };
  const DEFAULT_PRESET = 'custom';
  const PRESET_BALANCED = PRESETS.balanced;

  // PLAN C절 파라미터 범위 [min, max]. 범위 정의는 이 한 곳 (GUIDELINES 3-5).
  const RANGES = {
    P: [1.0, 8.0],
    k: [0.4, 0.9],
    n: [2.0, 4], // 하한 1.5→2.0: n<2는 k에서 곡률이 무한대라 무릎선 위험 (PLAN M5-1)
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
    custom: 'sdrhdr.custom',
    customPrev: 'sdrhdr.customPrev', // 프리셋에서 상세 편집을 시작할 때 덮어쓴 사용자 지정 곡선 백업 (PLAN M7-3)
    hud: 'sdrhdr.hud',
    restoredAt: 'sdrhdr.restoredAt', // 재시작 뒤 백업에서 복원한 시각(ms), popup 안내용 (FIX_GUIDE U1)
    notify: 'sdrhdr.notify', // 상태 알림 칩 (PLAN D-M8 M8-0 (f))
    strength: 'sdrhdr.strength',
    sharpness: 'sdrhdr.sharpness',
    saturation: 'sdrhdr.saturation',
    diag: 'sdrhdr.diag',
    diagRequest: 'sdrhdr.diagRequest',
  };
  // 슬라이더 범위·기본값 (PLAN D-M4a, M4-E). 강도 0 = 색 변환만, 1 = ITM 전체. 기본 0.45는 M4a 사용자 회신으로 확정.
  const STRENGTH = { min: 0, max: 1, step: 0.01, default: 0.43 };
  const SHARPNESS = { min: 0, max: 1, step: 0.01, default: 0 };
  const SATURATION = { min: 0.5, max: 1.5, step: 0.01, default: 1.05 };
  // 상세 슬라이더 step (PLAN M5-1). 범위는 RANGES 한 곳.
  const DETAIL_STEPS = { P: 0.1, k: 0.01, n: 0.1, g: 0.01, s: 0.01, hs: 0.01 };
  const DEFAULTS = {
    enabled: true,
    mode: 'itm',
    preset: DEFAULT_PRESET,
    strength: STRENGTH.default,
    sharpness: SHARPNESS.default,
    saturation: SATURATION.default,
    custom: Object.assign({}, DEFAULT_CUSTOM),
    hud: false,
    notify: true,
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

  // 순수: 사용자 지정 곡선 값 {P,k,n,g,s,hs}. 각 값은 RANGES로 클램프하고 step으로 반올림, 누락·비숫자는 DEFAULT_CUSTOM 값.
  function normalizeCustom(raw) {
    const r = raw && typeof raw === 'object' ? raw : {};
    const out = {};
    for (const key of Object.keys(DETAIL_STEPS)) {
      const [min, max] = RANGES[key];
      out[key] = normalizeRange(
        { min, max, step: DETAIL_STEPS[key], default: DEFAULT_CUSTOM[key] },
        r[key],
      );
    }
    return out;
  }

  // 순수: 설정 -> 곡선 파라미터. custom이면 사용자 지정 값, 아니면 프리셋 값.
  function curveOf(settings) {
    const s = settings || {};
    if (Object.prototype.hasOwnProperty.call(PRESETS, s.preset)) return PRESETS[s.preset];
    return normalizeCustom(s.custom);
  }

  // 순수: 곡선 f(y). WGSL `curve`와 같은 식이며 y>1(게인 g>1 뒤)에서도 같은 다항식을 쓴다 (PLAN M7-1, GUIDELINES 3-1).
  function curveY(y, c) {
    if (y <= c.k) return y;
    const pp = (c.P - c.k) / (1 - c.k);
    const u = (y - c.k) / (1 - c.k);
    return c.k + (1 - c.k) * (u + (pp - 1) * Math.pow(u, c.n));
  }

  // 순수: 유효 피크 = 1 + t (f(g) - 1). 셰이더가 g를 곡선 앞에서 곱하므로 흰색(1.0)의 출력은 f(g)다 (PLAN M7-1).
  // g=1이면 f(1) = P라 기존 1 + t (P - 1)과 같다. 화면 밝기 헤드룸을 넘으면 하이라이트가 잘릴 수 있다.
  function effectivePeak(settings) {
    const c = curveOf(settings);
    const t = normalizeRange(STRENGTH, (settings || {}).strength);
    return 1 + t * (curveY(c.g, c) - 1);
  }

  // 고정 헤드룸 표 (PLAN A18 실측: 화면 밝기 낮음 4 / 중간 3 / 최대 2). JS에서 헤드룸은 조회할 수 없다 (A17).
  const HEADROOM_STEPS = [
    { label: '최대', h: 2 },
    { label: '중간', h: 3 },
    { label: '낮음', h: 4 },
  ];

  // 순수: 유효 피크가 어느 화면 밝기 단계에서 잘리는지. clipAt은 잘리는 단계 라벨(밝은 쪽부터), ok는 모든 단계에서 여유.
  function peakAdvice(peak) {
    const clipAt = HEADROOM_STEPS.filter((st) => peak > st.h).map((st) => st.label);
    return { clipAt, ok: clipAt.length === 0 };
  }

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
      custom: normalizeCustom(r[KEYS.custom]),
      hud: typeof r[KEYS.hud] === 'boolean' ? r[KEYS.hud] : DEFAULTS.hud,
      notify: typeof r[KEYS.notify] === 'boolean' ? r[KEYS.notify] : DEFAULTS.notify,
    };
  }

  // 순수: 설정 -> uniform 배열(UNIFORM_FLOATS개 숫자). renderer가 writeBuffer로 그대로 쓴다.
  function toUniformArray(settings) {
    const s = settings || {};
    const p = curveOf(s);
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
    KEYS.custom,
    KEYS.hud,
    KEYS.notify,
  ];

  // 네이티브 백업 대상 (FIX_GUIDE U1). 진단 모드·진단·진단 요청·곡선 백업은 제외한다.
  // background.js는 params.js를 로드하지 않아 같은 목록을 따로 갖고, 테스트가 둘의 일치를 검사한다.
  const BACKUP_KEYS = [
    KEYS.enabled,
    KEYS.preset,
    KEYS.custom,
    KEYS.strength,
    KEYS.sharpness,
    KEYS.saturation,
    KEYS.hud,
    KEYS.notify,
  ];

  // 기본값 복원 대상 (PLAN M7-0 (d)). enabled·mode·diag·customPrev는 건드리지 않는다. 값은 DEFAULTS에서 읽는다.
  const RESETTABLE_KEYS = [
    KEYS.preset,
    KEYS.custom,
    KEYS.strength,
    KEYS.sharpness,
    KEYS.saturation,
    KEYS.hud,
    KEYS.notify,
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

  // 메시지 타입 (PLAN D-M8 M8-1, GUIDELINES 2.1-5). popup -> content 요청, content -> background 배지 알림.
  const MSG = { getState: 'sdrhdr:getState', state: 'sdrhdr:state' };

  const BADGE_GRAY = '#8e8e93';
  const BADGE_ORANGE = '#ff9500';
  const BADGE_RED = '#ff3b30';
  const OFF = { text: '' };

  // 순수: 현재 탭 상태 -> 표시용 {level, text, hint, badge:{text,color}} (PLAN D-M8 M8-1).
  // 입력: {enabled, mode, state, skip, undecided, errorName, drmNow, bypass}. URL·제목은 받지 않는다 (GUIDELINES 2.6-1).
  function statusOf(input) {
    const i = input && typeof input === 'object' ? input : {};
    const out = (level, text, hint, badge) => ({
      level,
      text,
      hint: hint || '',
      badge: badge || OFF,
    });
    if (i.enabled === false || (i.state === 'skipped' && i.skip === 'disabled'))
      return out('off', '꺼짐', 'Option+Shift+H 또는 위 스위치로 켜기');
    if (typeof i.mode === 'string' && i.mode !== 'itm')
      return out('diag', '진단 모드: HDR 변환 안 함', '진단 영역에서 정상 모드로', {
        text: 'D',
        color: BADGE_GRAY,
      });
    if (i.bypass) return out('ok', '원본 보기 중', 'Option+H를 떼면 복귀');
    const retry = '다른 영상으로 이동하거나 HDR 변환을 껐다 켜기';
    if (i.state === 'active') return out('ok', 'HDR 변환 중');
    if (i.state === 'probing') {
      if (i.undecided)
        return out('error', '입력 경로를 찾지 못해 원본 표시', retry, {
          text: '!',
          color: BADGE_ORANGE,
        });
      return out('wait', '판정 중(원본 표시)', '', { text: '…', color: BADGE_GRAY });
    }
    if (i.state === 'skipped') {
      switch (i.skip) {
        case 'drm':
          return i.drmNow
            ? out('skip', 'DRM 영상: 변환하지 않음', '', { text: '–', color: BADGE_GRAY })
            : out(
                'skip',
                '이전 DRM 영상 때문에 이 탭에서는 변환 중지',
                '새로고침(⌘R)하면 다시 동작',
                { text: '–', color: BADGE_GRAY },
              );
        case 'hdrSource':
          return out('skip', '이미 HDR 영상: 원본 표시', '', { text: 'HDR', color: BADGE_GRAY });
        case 'pip':
          return out('skip', 'PiP 중: 원본 표시', '', { text: '–', color: BADGE_GRAY });
        case 'blackFrame':
          return out('error', '입력이 검게 읽혀 중단', retry, {
            text: '!',
            color: BADGE_ORANGE,
          });
        case 'noGpu': {
          const name = typeof i.errorName === 'string' && i.errorName !== '' ? i.errorName : '?';
          return out(
            'error',
            '렌더 오류(' + name + ')',
            'HDR 변환을 껐다 켜거나 새로고침, 반복되면 Safari 재시작',
            { text: '!', color: BADGE_RED },
          );
        }
        default:
          break;
      }
    }
    return out('wait', '대상 영상을 찾는 중', 'YouTube 영상 페이지에서 재생');
  }

  // 단축키·popup이 켜기 상태를 뒤집을 때 쓴다 (PLAN D-M8 M8-1).
  function setEnabled(v) {
    return browser.storage.local.set({ [KEYS.enabled]: !!v });
  }

  // 최신 진단 1개만 유지 (GUIDELINES 2.6-2).
  function writeDiag(diag) {
    return browser.storage.local.set({ [KEYS.diag]: diag });
  }

  // popup이 진단 영역을 연 동안만 요청 시각(ms)을 쓴다. content는 보이는 탭에서만 응답한다 (FIX_GUIDE T2).
  function requestDiag() {
    return browser.storage.local.set({ [KEYS.diagRequest]: Date.now() });
  }

  // 진단 요청 키가 바뀔 때 cb()를 호출한다. 반환값은 구독 해제 함수.
  function subscribeDiagRequest(cb) {
    const listener = (changes, area) => {
      if (area !== 'local' || !(KEYS.diagRequest in changes)) return;
      cb();
    };
    browser.storage.onChanged.addListener(listener);
    return () => browser.storage.onChanged.removeListener(listener);
  }

  globalThis.__sdrhdr.params = {
    PRESETS,
    PRESET_IDS,
    DEFAULT_PRESET,
    DEFAULT_CUSTOM,
    PRESET_BALANCED,
    RANGES,
    MODES,
    KEYS,
    DEFAULTS,
    STRENGTH,
    SHARPNESS,
    SATURATION,
    DETAIL_STEPS,
    HEADROOM_STEPS,
    RESETTABLE_KEYS,
    BACKUP_KEYS,
    UNIFORM_ORDER,
    UNIFORM_FLOATS,
    normalizeRange,
    normalizeCustom,
    curveOf,
    curveY,
    effectivePeak,
    peakAdvice,
    MSG,
    statusOf,
    setEnabled,
    normalizeStrength,
    normalizeSettings,
    toUniformArray,
    readSettings,
    subscribe,
    writeDiag,
    requestDiag,
    subscribeDiagRequest,
  };
})();
