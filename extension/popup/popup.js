'use strict';
(function () {
  const params = globalThis.__sdrhdr.params;
  const K = params.KEYS;
  const $ = (id) => document.getElementById(id);
  const STRENGTH_SAVE_MS = 100; // 드래그 중 저장 간격
  let blobUrl = null;
  let strengthTimer = null;
  let strengthPending = null;

  function showDiag(diag) {
    const text = diag
      ? JSON.stringify(diag, null, 2)
      : '(진단 없음: youtube.com 탭을 연 뒤 다시 열기)';
    $('diag').value = text;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    $('save').href = blobUrl;
  }

  function showStrength(v) {
    $('strength').value = String(Math.round(v * 100));
    $('strength-value').textContent = Math.round(v * 100) + '%';
  }

  function flushStrength() {
    if (strengthTimer !== null) clearTimeout(strengthTimer);
    strengthTimer = null;
    if (strengthPending === null) return;
    const v = strengthPending;
    strengthPending = null;
    browser.storage.local.set({ [K.strength]: v });
  }

  async function init() {
    const raw = await browser.storage.local.get([K.enabled, K.mode, K.strength, K.diag]);
    const s = params.normalizeSettings(raw);
    $('enabled').checked = s.enabled;
    $('mode').value = s.mode;
    showStrength(s.strength);
    $('strength').disabled = s.mode !== 'itm';
    showDiag(raw[K.diag]);

    $('enabled').addEventListener('change', () => {
      browser.storage.local.set({ [K.enabled]: $('enabled').checked });
    });
    $('mode').addEventListener('change', () => {
      browser.storage.local.set({ [K.mode]: $('mode').value });
      $('strength').disabled = $('mode').value !== 'itm';
    });
    $('strength').addEventListener('input', () => {
      const v = params.normalizeStrength(Number($('strength').value) / 100);
      $('strength-value').textContent = Math.round(v * 100) + '%';
      strengthPending = v;
      if (strengthTimer !== null) return;
      strengthTimer = setTimeout(flushStrength, STRENGTH_SAVE_MS);
    });
    // 드래그를 놓는 순간 마지막 값이 확실히 저장되게 한다.
    $('strength').addEventListener('change', flushStrength);
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
