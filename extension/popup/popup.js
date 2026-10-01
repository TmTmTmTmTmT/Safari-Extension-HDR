'use strict';
(function () {
  const params = globalThis.__sdrhdr.params;
  const K = params.KEYS;
  const $ = (id) => document.getElementById(id);
  const SAVE_MS = 100; // 슬라이더 드래그 중 저장 간격
  let blobUrl = null;

  // 슬라이더(강도·선명도·채도). 표시값은 %이고 저장값은 params 범위의 숫자다.
  const SLIDERS = [
    { id: 'strength', key: K.strength, spec: params.STRENGTH },
    { id: 'sharpness', key: K.sharpness, spec: params.SHARPNESS },
    { id: 'saturation', key: K.saturation, spec: params.SATURATION },
  ];

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

  function bindSlider(sl) {
    let timer = null;
    let pending = null;
    const flush = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
      if (pending === null) return;
      const v = pending;
      pending = null;
      browser.storage.local.set({ [sl.key]: v });
    };
    $(sl.id).addEventListener('input', () => {
      const v = params.normalizeRange(sl.spec, Number($(sl.id).value) / 100);
      $(sl.id + '-value').textContent = Math.round(v * 100) + '%';
      pending = v;
      if (timer !== null) return;
      timer = setTimeout(flush, SAVE_MS);
    });
    // 드래그를 놓는 순간 마지막 값이 확실히 저장되게 한다.
    $(sl.id).addEventListener('change', flush);
  }

  function setItmControlsEnabled(mode) {
    const on = mode === 'itm';
    $('preset').disabled = !on;
    for (const sl of SLIDERS) $(sl.id).disabled = !on;
  }

  async function init() {
    const raw = await browser.storage.local.get([...Object.values(K)]);
    const s = params.normalizeSettings(raw);
    $('enabled').checked = s.enabled;
    $('mode').value = s.mode;
    $('preset').value = s.preset;
    for (const sl of SLIDERS) showSlider(sl, s[sl.id]);
    setItmControlsEnabled(s.mode);
    showDiag(raw[K.diag]);

    $('enabled').addEventListener('change', () => {
      browser.storage.local.set({ [K.enabled]: $('enabled').checked });
    });
    $('mode').addEventListener('change', () => {
      browser.storage.local.set({ [K.mode]: $('mode').value });
      setItmControlsEnabled($('mode').value);
    });
    $('preset').addEventListener('change', () => {
      browser.storage.local.set({ [K.preset]: $('preset').value });
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
