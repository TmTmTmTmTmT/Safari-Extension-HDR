'use strict';
(function () {
  const params = globalThis.__sdrhdr.params;
  const K = params.KEYS;
  const $ = (id) => document.getElementById(id);
  let blobUrl = null;

  function showDiag(diag) {
    const text = diag
      ? JSON.stringify(diag, null, 2)
      : '(진단 없음: youtube.com 탭을 연 뒤 다시 열기)';
    $('diag').value = text;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    $('save').href = blobUrl;
  }

  async function init() {
    const raw = await browser.storage.local.get([K.enabled, K.mode, K.diag]);
    const s = params.normalizeSettings(raw);
    $('enabled').checked = s.enabled;
    $('mode').value = s.mode;
    showDiag(raw[K.diag]);

    $('enabled').addEventListener('change', () => {
      browser.storage.local.set({ [K.enabled]: $('enabled').checked });
    });
    $('mode').addEventListener('change', () => {
      browser.storage.local.set({ [K.mode]: $('mode').value });
    });
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
