'use strict';
(function () {
  const params = globalThis.__sdrhdr.params;
  const K = params.KEYS;
  const $ = (id) => document.getElementById(id);
  const SAVE_MS = 100; // 슬라이더 드래그 중 저장 간격
  const CONFIRM_MS = 3000; // 기본값 복원 확인 대기
  const COPY_MS = 2000; // '복사됨' 표시 시간
  const STALE_S = 30; // 진단 출처 줄을 흐리게 하는 경과(초)
  // 프리셋 한글명(저장 id는 그대로). 백업 안내 문구에 쓴다.
  const PRESET_LABEL = { accurate: '정확', balanced: '균형', vivid: '강조' };
  let blobUrl = null;
  // 현재 UI 값. 유효 피크와 상세 슬라이더 시작값을 저장소 재조회 없이 계산하는 데 쓴다.
  let cur = null;
  let prevCustom = null; // 마지막 백업(되돌리기 대상)
  let backupShown = false; // 이번 편집 세션에서 이미 백업했는지
  let shownDiag = null; // textarea에 표시 중인 진단
  let pendingDiag = null; // 포커스·선택 때문에 보류한 새 진단 {diag}
  const throttlers = [];

  // 슬라이더(강도·선명도·채도). 표시값은 %이고 저장값은 params 범위의 숫자다.
  const SLIDERS = [
    { id: 'strength', key: K.strength, spec: params.STRENGTH },
    { id: 'sharpness', key: K.sharpness, spec: params.SHARPNESS },
    { id: 'saturation', key: K.saturation, spec: params.SATURATION },
  ];
  const DETAIL_KEYS = Object.keys(params.DETAIL_STEPS);
  // 진단 모드일 때 잠그는 컨트롤
  const LOCKABLE = ['preset', ...SLIDERS.map((s) => s.id), ...DETAIL_KEYS.map((k) => 'd-' + k)];
  // init 실패 시 전부 잠그는 컨트롤
  const ALL_CONTROLS = [
    ...LOCKABLE,
    'enabled',
    'hud',
    'mode',
    'reset',
    'copy',
    'normal-mode',
    'backup-undo',
  ];

  const pad = (n) => String(n).padStart(2, '0');
  function hms(ms) {
    const d = new Date(ms);
    return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
  }

  // 저장. 실패(reject·예외)는 '저장 실패'로 보인다. set이 promise를 안 돌려줘도 죽지 않는다.
  function setSaveStatus(ok) {
    $('save-status').textContent = ok ? '' : '저장 실패';
  }
  function save(obj) {
    try {
      const p = browser.storage.local.set(obj);
      if (p && typeof p.then === 'function')
        p.then(
          () => setSaveStatus(true),
          () => setSaveStatus(false),
        );
    } catch (e) {
      setSaveStatus(false);
    }
  }

  // 진단 JSON 표시. 스크롤 위치는 갱신 뒤에도 유지한다.
  function showDiag(diag) {
    shownDiag = diag || null;
    pendingDiag = null;
    $('diag-refresh').hidden = true;
    const text = diag
      ? JSON.stringify(diag, null, 2)
      : '(진단 없음: youtube.com 탭을 연 뒤 다시 열기)';
    const ta = $('diag');
    const top = ta.scrollTop;
    ta.value = text;
    ta.scrollTop = top;
    if (blobUrl) URL.revokeObjectURL(blobUrl);
    blobUrl = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    $('save').href = blobUrl;
    showSource();
  }

  // 새 진단 도착. 읽거나 선택하는 중이면 보류한다.
  function onDiag(diag) {
    const ta = $('diag');
    const busy = document.activeElement === ta || ta.selectionStart !== ta.selectionEnd;
    if (busy) {
      pendingDiag = { diag };
      $('diag-refresh').hidden = false;
    } else {
      showDiag(diag);
    }
  }

  // 출처 줄: 기록 시각·경과·상태만. URL·제목은 표시하지 않는다.
  function showSource() {
    const el = $('diag-source');
    const t = shownDiag ? Date.parse(shownDiag.createdAt) : NaN;
    if (!shownDiag || !Number.isFinite(t)) {
      el.textContent = '';
      el.classList.remove('stale');
      return;
    }
    const ago = Math.max(0, Math.round((Date.now() - t) / 1000));
    const state = shownDiag.lifecycle && shownDiag.lifecycle.state;
    el.textContent =
      '마지막 기록 ' + hms(t) + '(' + ago + '초 전)' + (state ? ' · 상태 ' + state : '');
    el.classList.toggle('stale', ago > STALE_S);
  }

  // 표시 문자열 (UX-30): P·g ×, s·hs %, k·n 소수. step이 0.1이면 1자리, 0.01이면 2자리.
  const decimals = (step) => Math.round(-Math.log10(step));
  const pct = (v) => Math.round(v * 100) + '%';
  function fmtDetail(key, v) {
    if (key === 's' || key === 'hs') return pct(v);
    const t = v.toFixed(decimals(params.DETAIL_STEPS[key]));
    return key === 'P' || key === 'g' ? '×' + t : t;
  }

  function setValueText(id, text, defText) {
    $(id + '-value').textContent = text;
    $(id).setAttribute('aria-valuetext', text);
    $(id + '-def').textContent = defText;
  }

  function showSlider(sl, v) {
    $(sl.id).value = String(Math.round(v * 100));
    const text = pct(v);
    const def = pct(sl.spec.default);
    setValueText(sl.id, text, text === def ? '' : '(기본 ' + def + ')');
  }

  function showPeak() {
    const peak = params.effectivePeak(cur);
    $('peak-value').textContent = '유효 피크 ×' + peak.toFixed(2) + ' (SDR 흰색 대비)';
    const adv = params.peakAdvice(peak);
    const warn = $('peak-warn');
    if (adv.ok) {
      warn.textContent = '모든 화면 밝기에서 여유';
    } else {
      warn.textContent =
        '! 화면 밝기 ' +
        adv.clipAt.join('·') +
        '에서 하이라이트가 잘릴 수 있음(화면 밝기를 낮추거나 강도를 줄이세요)';
    }
    warn.classList.toggle('warn', !adv.ok);
  }

  // 상세 슬라이더 기준값: 이름 있는 프리셋은 그 값, 사용자 지정은 DEFAULT_CUSTOM.
  function detailRef() {
    return Object.prototype.hasOwnProperty.call(params.PRESETS, cur.preset)
      ? params.PRESETS[cur.preset]
      : params.DEFAULT_CUSTOM;
  }
  function showDetailValue(key, v) {
    $('d-' + key).value = String(v);
    const text = fmtDetail(key, v);
    const def = fmtDetail(key, detailRef()[key]);
    setValueText('d-' + key, text, text === def ? '' : '(기본 ' + def + ')');
  }
  function showDetail() {
    const c = params.curveOf(cur);
    for (const key of DETAIL_KEYS) showDetailValue(key, c[key]);
  }

  // 슬라이더별 독립 타이머로 100 ms마다 저장하고, change(드래그 종료) 시 마지막 값을 flush한다.
  function throttled(write) {
    let timer = null;
    let dirty = false;
    const clear = () => {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    };
    const flush = () => {
      clear();
      if (!dirty) return;
      dirty = false;
      write();
    };
    const t = {
      touch() {
        dirty = true;
        if (timer === null) timer = setTimeout(flush, SAVE_MS);
      },
      flush,
      cancel() {
        clear();
        dirty = false;
      },
    };
    throttlers.push(t);
    return t;
  }

  function bindSlider(sl) {
    const t = throttled(() => save({ [sl.key]: cur[sl.id] }));
    $(sl.id).addEventListener('input', () => {
      const v = params.normalizeRange(sl.spec, Number($(sl.id).value) / 100);
      cur[sl.id] = v;
      showSlider(sl, v);
      showPeak();
      t.touch();
    });
    // 드래그를 놓는 순간 마지막 값이 확실히 저장되게 한다.
    $(sl.id).addEventListener('change', t.flush);
  }

  const sameCurve = (a, b) => DETAIL_KEYS.every((k) => a[k] === b[k]);

  function showBackupNotice(presetId) {
    backupShown = true;
    $('backup-text').textContent =
      '이전 사용자 지정 곡선을 「' + PRESET_LABEL[presetId] + '」 기준으로 바꿨습니다';
    $('backup-note').hidden = false;
  }
  function hideBackupNotice() {
    backupShown = false;
    $('backup-note').hidden = true;
  }

  // 상세 슬라이더 저장은 preset과 custom 전체를 한 번에 쓴다(렌더러가 반쯤 바뀐 곡선을 읽지 않게).
  function bindDetails() {
    const t = throttled(() =>
      save({ [K.preset]: 'custom', [K.custom]: params.normalizeCustom(cur.custom) }),
    );
    for (const key of DETAIL_KEYS) {
      const [min, max] = params.RANGES[key];
      const spec = {
        min,
        max,
        step: params.DETAIL_STEPS[key],
        default: params.DEFAULT_CUSTOM[key],
      };
      const el = $('d-' + key);
      el.min = String(min);
      el.max = String(max);
      el.step = String(spec.step);
      el.addEventListener('input', () => {
        // 프리셋에서 처음 들어오면 그 프리셋 값을 복사해 시작한다. 덮어쓰는 사용자 지정 곡선은 먼저 백업한다.
        const base = params.curveOf(cur);
        if (cur.preset !== 'custom' && !backupShown) {
          const old = params.normalizeCustom(cur.custom);
          if (!sameCurve(old, base)) {
            prevCustom = old;
            save({ [K.customPrev]: old });
            showBackupNotice(cur.preset);
          }
        }
        const v = params.normalizeRange(spec, Number(el.value));
        cur.custom = Object.assign({}, base, { [key]: v });
        cur.preset = 'custom';
        $('preset').value = 'custom';
        showDetail();
        showPeak();
        t.touch();
      });
      el.addEventListener('change', t.flush);
    }
  }

  function undoBackup() {
    if (!prevCustom) return;
    for (const t of throttlers) t.cancel();
    cur.custom = Object.assign({}, prevCustom);
    cur.preset = 'custom';
    // preset과 custom을 한 번의 set으로 쓴다.
    save({ [K.preset]: 'custom', [K.custom]: cur.custom });
    $('preset').value = 'custom';
    showDetail();
    showPeak();
    hideBackupNotice();
  }

  // 진단 모드면 일반 컨트롤을 잠그고 안내를 보인다. 모드 이름은 진단 영역 안에만 쓴다(GUIDELINES 2.6-3).
  function applyMode(mode, openDiag) {
    const locked = mode !== 'itm';
    for (const id of LOCKABLE) {
      const el = $(id);
      el.disabled = locked;
      if (locked) el.setAttribute('aria-describedby', 'locked-note');
      else el.removeAttribute('aria-describedby');
    }
    $('locked-note').hidden = !locked;
    $('diag-banner').hidden = !locked;
    if (locked && openDiag) $('diag-section').open = true;
  }

  function showEnabled() {
    const on = $('enabled').checked;
    $('enabled-state').textContent = on ? '켜짐' : '꺼짐';
    $('off-note').hidden = on;
    document.body.classList.toggle('off', !on);
  }

  // init과 기본값 복원이 같은 표시 경로를 쓴다.
  function render(openDiag) {
    $('enabled').checked = cur.enabled;
    showEnabled();
    $('mode').value = cur.mode;
    $('preset').value = cur.preset;
    $('hud').checked = cur.hud;
    for (const sl of SLIDERS) showSlider(sl, cur[sl.id]);
    showDetail();
    showPeak();
    applyMode(cur.mode, openDiag);
  }

  // 기본값 복원: 첫 클릭은 확인 대기, 3초 안에 다시 누르면 실행한다.
  let armTimer = null;
  function disarmReset() {
    if (armTimer !== null) clearTimeout(armTimer);
    armTimer = null;
    $('reset').textContent = '기본값으로 되돌리기';
  }
  async function doReset() {
    for (const t of throttlers) t.cancel();
    try {
      await browser.storage.local.remove(params.RESETTABLE_KEYS);
    } catch (e) {
      setSaveStatus(false);
      return;
    }
    // enabled·mode는 유지하고 나머지는 기본값으로 다시 만든다.
    cur = params.normalizeSettings({ [K.enabled]: cur.enabled, [K.mode]: cur.mode });
    hideBackupNotice();
    setSaveStatus(true);
    render(true);
  }
  function onResetClick() {
    if (armTimer === null) {
      $('reset').textContent = '한 번 더 눌러 확인';
      armTimer = setTimeout(disarmReset, CONFIRM_MS);
      return;
    }
    disarmReset();
    doReset();
  }

  function onCopy() {
    const ta = $('diag');
    const status = $('copy-status');
    ta.select();
    const fallback = () => {
      status.textContent = 'Command-C를 누르세요';
    };
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      fallback();
      return;
    }
    let p;
    try {
      p = navigator.clipboard.writeText(ta.value);
    } catch (e) {
      fallback();
      return;
    }
    Promise.resolve(p).then(() => {
      const t = shownDiag ? Date.parse(shownDiag.createdAt) : NaN;
      status.textContent = '복사됨' + (Number.isFinite(t) ? ' (' + hms(t) + ' 진단)' : '');
      setTimeout(() => {
        status.textContent = '';
      }, COPY_MS);
    }, fallback);
  }

  function showInitError() {
    $('init-error').textContent =
      '설정을 읽지 못했습니다. popup을 다시 열거나 Safari를 재시작하세요';
    $('init-error').hidden = false;
    for (const id of ALL_CONTROLS) $(id).disabled = true;
  }

  async function init() {
    const raw = await browser.storage.local.get([...Object.values(K)]);
    cur = params.normalizeSettings(raw);
    bindDetails();
    render(true);
    showDiag(raw[K.diag]);

    $('enabled').addEventListener('change', () => {
      showEnabled();
      save({ [K.enabled]: $('enabled').checked });
    });
    $('mode').addEventListener('change', () => {
      cur.mode = $('mode').value;
      save({ [K.mode]: cur.mode });
      applyMode(cur.mode, false);
    });
    $('normal-mode').addEventListener('click', () => {
      cur.mode = 'itm';
      $('mode').value = 'itm';
      save({ [K.mode]: 'itm' });
      applyMode('itm', false);
    });
    $('preset').addEventListener('change', () => {
      cur.preset = $('preset').value;
      showDetail();
      showPeak();
      save({ [K.preset]: cur.preset });
    });
    $('hud').addEventListener('change', () => {
      save({ [K.hud]: $('hud').checked });
    });
    for (const sl of SLIDERS) bindSlider(sl);
    $('backup-undo').addEventListener('click', undoBackup);
    $('reset').addEventListener('click', onResetClick);
    $('copy').addEventListener('click', onCopy);
    $('diag-refresh').addEventListener('click', () => {
      if (pendingDiag) showDiag(pendingDiag.diag);
    });
    browser.storage.onChanged.addListener((changes, area) => {
      if (area === 'local' && K.diag in changes) onDiag(changes[K.diag].newValue);
    });
    // 경과 시간 갱신(타이머가 없는 환경에서는 건너뜀)
    if (typeof setInterval === 'function') setInterval(showSource, 1000);
  }

  init().catch(showInitError);
})();
