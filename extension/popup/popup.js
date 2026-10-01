'use strict';
(function () {
  const params = globalThis.__sdrhdr.params;
  const K = params.KEYS;
  const $ = (id) => document.getElementById(id);
  const SAVE_MS = 100; // 슬라이더 드래그 중 저장 간격
  const PEAK_WARN = 2.0; // 밝기 최대 헤드룸(약 2), PLAN M5-1
  let blobUrl = null;
  // 현재 UI 값. 유효 피크와 상세 슬라이더 시작값을 저장소 재조회 없이 계산하는 데 쓴다.
  let cur = null;

  // 슬라이더(강도·선명도·채도). 표시값은 %이고 저장값은 params 범위의 숫자다.
  const SLIDERS = [
    { id: 'strength', key: K.strength, spec: params.STRENGTH },
    { id: 'sharpness', key: K.sharpness, spec: params.SHARPNESS },
    { id: 'saturation', key: K.saturation, spec: params.SATURATION },
  ];
  const DETAIL_KEYS = Object.keys(params.DETAIL_STEPS);

  function showDiag(diag) {
    const text = diag
      ? JSON.stringify(diag, null, 2)
      : '(진단 없음: youtube.com 탭을 연 뒤 다시 열기)';
    $('diag').value = text;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    $('save').href = blobUrl;
  }

  function showSlider(sl, v) {
    $(sl.id).value = String(Math.round(v * 100));
    $(sl.id + '-value').textContent = Math.round(v * 100) + '%';
  }

  function showPeak() {
    const peak = params.effectivePeak(cur);
    let text = '유효 피크 ×' + peak.toFixed(2);
    if (peak > PEAK_WARN) text += ' — 밝기 최대에서 하이라이트가 잘릴 수 있음';
    $('effective-peak').textContent = text;
  }

  // step이 0.1이면 1자리, 0.01이면 2자리로 표시한다.
  const decimals = (step) => Math.round(-Math.log10(step));
  function showDetailValue(key, v) {
    $('d-' + key).value = String(v);
    $('d-' + key + '-value').textContent = v.toFixed(decimals(params.DETAIL_STEPS[key]));
  }
  function showDetail() {
    const c = params.curveOf(cur);
    for (const key of DETAIL_KEYS) showDetailValue(key, c[key]);
  }

  // 슬라이더별 독립 타이머로 100 ms마다 저장하고, change(드래그 종료) 시 마지막 값을 flush한다.
  function throttled(write) {
    let timer = null;
    let dirty = false;
    const flush = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (!dirty) return;
      dirty = false;
      write();
    };
    return {
      touch() {
        dirty = true;
        if (timer === null) timer = setTimeout(flush, SAVE_MS);
      },
      flush,
    };
  }

  function bindSlider(sl) {
    const t = throttled(() => browser.storage.local.set({ [sl.key]: cur[sl.id] }));
    $(sl.id).addEventListener('input', () => {
      const v = params.normalizeRange(sl.spec, Number($(sl.id).value) / 100);
      $(sl.id + '-value').textContent = Math.round(v * 100) + '%';
      cur[sl.id] = v;
      showPeak();
      t.touch();
    });
    // 드래그를 놓는 순간 마지막 값이 확실히 저장되게 한다.
    $(sl.id).addEventListener('change', t.flush);
  }

  function bindDetail(key) {
    const [min, max] = params.RANGES[key];
    const spec = {
      min,
      max,
      step: params.DETAIL_STEPS[key],
      default: params.PRESETS.accurate[key],
    };
    const el = $('d-' + key);
    el.min = String(min);
    el.max = String(max);
    el.step = String(spec.step);
    // 저장은 preset과 custom 전체를 한 번에 쓴다(렌더러가 반쯤 바뀐 곡선을 읽지 않게).
    const t = throttled(() =>
      browser.storage.local.set({
        [K.preset]: 'custom',
        [K.custom]: params.normalizeCustom(cur.custom),
      }),
    );
    el.addEventListener('input', () => {
      // 프리셋에서 처음 들어오면 그 프리셋 값을 복사해 시작한다.
      const base = params.curveOf(cur);
      const v = params.normalizeRange(spec, Number(el.value));
      cur.custom = Object.assign({}, base, { [key]: v });
      cur.preset = 'custom';
      $('preset').value = 'custom';
      showDetailValue(key, v);
      showPeak();
      t.touch();
    });
    el.addEventListener('change', t.flush);
  }

  function setItmControlsEnabled(mode) {
    const on = mode === 'itm';
    $('preset').disabled = !on;
    for (const sl of SLIDERS) $(sl.id).disabled = !on;
    for (const key of DETAIL_KEYS) $('d-' + key).disabled = !on;
  }

  async function init() {
    const raw = await browser.storage.local.get([...Object.values(K)]);
    cur = params.normalizeSettings(raw);
    $('enabled').checked = cur.enabled;
    $('mode').value = cur.mode;
    $('preset').value = cur.preset;
    $('hud').checked = cur.hud;
    for (const sl of SLIDERS) showSlider(sl, cur[sl.id]);
    for (const key of DETAIL_KEYS) bindDetail(key);
    showDetail();
    showPeak();
    setItmControlsEnabled(cur.mode);
    showDiag(raw[K.diag]);

    $('enabled').addEventListener('change', () => {
      browser.storage.local.set({ [K.enabled]: $('enabled').checked });
    });
    $('mode').addEventListener('change', () => {
      browser.storage.local.set({ [K.mode]: $('mode').value });
      setItmControlsEnabled($('mode').value);
    });
    $('preset').addEventListener('change', () => {
      cur.preset = $('preset').value;
      showDetail();
      showPeak();
      browser.storage.local.set({ [K.preset]: cur.preset });
    });
    $('hud').addEventListener('change', () => {
      browser.storage.local.set({ [K.hud]: $('hud').checked });
    });
    for (const sl of SLIDERS) bindSlider(sl);
    $('copy').addEventListener('click', () => {
      $('diag').select();
      if (navigator.clipboard) navigator.clipboard.writeText($('diag').value).catch(() => {});
    });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && K.diag in changes) showDiag(changes[K.diag].newValue);
    });
  }

  init();
})();
