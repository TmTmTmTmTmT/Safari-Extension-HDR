'use strict';
// 툴바 배지·아이콘 + 설정 백업·복원 background (PLAN D-M8 M8-5, FIX_GUIDE U1). 상태 저장 없음, 네트워크 없음.
// params.js를 로드하지 않으므로 메시지 타입은 문자열을 직접 비교한다.
(function () {
  const MSG_STATE = 'sdrhdr:state'; // params.MSG.state와 같은 값
  const KEY_ENABLED = 'sdrhdr.enabled'; // params.KEYS.enabled와 같은 값
  // params.BACKUP_KEYS와 같은 값·같은 순서 (테스트가 일치 검사)
  const BACKUP_KEYS = [
    'sdrhdr.enabled',
    'sdrhdr.preset',
    'sdrhdr.custom',
    'sdrhdr.strength',
    'sdrhdr.sharpness',
    'sdrhdr.saturation',
    'sdrhdr.hud',
    'sdrhdr.notify',
    'sdrhdr.userPresets',
  ];
  const KEY_RESTORED_AT = 'sdrhdr.restoredAt'; // params.KEYS.restoredAt와 같은 값
  const NATIVE_APP_ID = 'io.github.tmtmtmtmtmt.SDRHDR'; // Safari는 무시하지만 인자는 필요
  const BACKUP_DEBOUNCE_MS = 1000;
  const ICONS_ON = {
    16: 'popup/icons/icon-16.png',
    19: 'popup/icons/icon-19.png',
    32: 'popup/icons/icon-32.png',
    38: 'popup/icons/icon-38.png',
  };
  const ICONS_OFF = {
    16: 'popup/icons/icon-off-16.png',
    19: 'popup/icons/icon-off-19.png',
    32: 'popup/icons/icon-off-32.png',
    38: 'popup/icons/icon-off-38.png',
  };

  // API 호출을 조용히 실행: 동기 예외·reject 모두 무시.
  function safe(fn) {
    try {
      const r = fn();
      if (r && typeof r.catch === 'function') r.catch(() => {});
    } catch (e) {
      /* 미지원 또는 탭이 이미 닫힘 */
    }
  }

  function setBadge(tabId, badge) {
    const act = typeof browser !== 'undefined' ? browser.action : null;
    if (!act) return;
    const text = typeof badge.text === 'string' ? badge.text.slice(0, 4) : '';
    if (typeof act.setBadgeText === 'function') {
      safe(() => act.setBadgeText({ tabId, text }));
    }
    if (typeof badge.color === 'string' && typeof act.setBadgeBackgroundColor === 'function') {
      const color = badge.color.slice(0, 32);
      safe(() => act.setBadgeBackgroundColor({ tabId, color }));
    }
  }

  function applyIcon(enabled) {
    const act = typeof browser !== 'undefined' ? browser.action : null;
    if (!act || typeof act.setIcon !== 'function') return;
    const path = enabled === false ? ICONS_OFF : ICONS_ON;
    safe(() => act.setIcon({ path }));
  }

  function onMessage(msg, sender) {
    if (!msg || msg.type !== MSG_STATE) return;
    if (!sender || !sender.tab || typeof sender.tab.id !== 'number') return;
    if (!msg.badge || typeof msg.badge !== 'object') return;
    setBadge(sender.tab.id, msg.badge);
  }

  let backupTimer = null;
  let restoreStarted = false;

  function sendNative(msg) {
    return browser.runtime.sendNativeMessage(NATIVE_APP_ID, msg);
  }

  // 복원이 필요했는데 아직 성공하지 못한 동안(재시도 중·실패)은 네이티브 백업을 저장소 일부 값으로 덮지 않는다.
  // 마지막으로 읽은 네이티브 백업에 저장소에 있는 키만 덮어써 보낸다(내 프리셋 등 손실 방지, FIX_GUIDE V1 (b0)).
  let nativeBase = null;

  function doBackup() {
    backupTimer = null;
    safe(() => {
      const p = browser.storage.local.get(BACKUP_KEYS);
      if (!p || typeof p.then !== 'function') return undefined;
      return p.then((r) => {
        const data = {};
        if (nativeBase) {
          for (const k of BACKUP_KEYS) {
            if (Object.prototype.hasOwnProperty.call(nativeBase, k)) data[k] = nativeBase[k];
          }
        }
        for (const k of BACKUP_KEYS) {
          if (r && r[k] !== undefined) data[k] = r[k];
        }
        return sendNative({ type: 'backup:set', data });
      });
    });
  }

  function scheduleBackup() {
    if (typeof setTimeout !== 'function') return;
    if (backupTimer !== null && typeof clearTimeout === 'function') clearTimeout(backupTimer);
    backupTimer = setTimeout(doBackup, BACKUP_DEBOUNCE_MS);
  }

  function onChanged(changes, area) {
    if (area !== 'local' || !changes) return;
    if (changes[KEY_ENABLED]) applyIcon(changes[KEY_ENABLED].newValue);
    if (BACKUP_KEYS.some((k) => changes[k])) scheduleBackup();
  }

  const RESTORE_RETRY_MS = [1000, 5000, 15000]; // 복원 쓰기 실패 시 재시도 간격 (FIX_GUIDE V1 (b0))

  function wait(ms) {
    return new Promise((r) => (typeof setTimeout === 'function' ? setTimeout(r, ms) : r()));
  }

  function storageEmpty() {
    return Promise.resolve(browser.storage.local.get(BACKUP_KEYS)).then(
      (cur) => !BACKUP_KEYS.some((k) => cur && cur[k] !== undefined),
    );
  }

  // 복원 쓰기. 실패하면 1·5·15초 뒤 재시도하되, 그 사이 사용자가 값을 쓰면(저장소가 비지 않으면) 멈춘다.
  function writeRestore(out, attempt) {
    return Promise.resolve()
      .then(() => browser.storage.local.set(out))
      .then(
        () => {
          nativeBase = null; // 복원 성공: 이후 백업은 저장소 기준
        },
        () => {
          if (attempt >= RESTORE_RETRY_MS.length) {
            if (typeof console !== 'undefined' && console.warn)
              console.warn('SDR HDR: 설정 복원 실패, Safari를 완전히 종료 후 다시 여세요');
            return undefined;
          }
          return wait(RESTORE_RETRY_MS[attempt])
            .then(storageEmpty)
            .then((empty) => {
              if (!empty) return undefined; // 사용자 값 우선
              out[KEY_RESTORED_AT] = Date.now();
              return writeRestore(out, attempt + 1);
            });
        },
      );
  }

  function restoreOnce() {
    if (restoreStarted) return;
    restoreStarted = true;
    safe(() =>
      storageEmpty()
        .then((empty) => {
          if (!empty) return undefined;
          return sendNative({ type: 'backup:get' }).then((res) => {
            const d = res && res.ok === true ? res.data : null;
            if (!d || typeof d !== 'object' || Array.isArray(d)) return undefined;
            const out = {};
            for (const k of BACKUP_KEYS) {
              if (Object.prototype.hasOwnProperty.call(d, k)) out[k] = d[k];
            }
            if (Object.keys(out).length === 0) return undefined;
            nativeBase = Object.assign({}, out);
            out[KEY_RESTORED_AT] = Date.now();
            return writeRestore(out, 0);
          });
        })
        .catch(() => {}),
    );
  }

  // 이전 버전이 진단에 쓰던 키를 1회 지운다(진단은 이제 메시지로만 주고받음, FIX_GUIDE V1 (c)).
  const LEGACY_KEYS = ['sdrhdr.diag', 'sdrhdr.diagRequest']; // params.LEGACY_KEYS와 같은 값
  function cleanupLegacy() {
    safe(() => browser.storage.local.remove(LEGACY_KEYS));
  }

  if (typeof browser === 'undefined') return;
  safe(() => browser.runtime.onMessage.addListener(onMessage));
  safe(() => browser.storage.onChanged.addListener(onChanged));
  safe(() => browser.runtime.onStartup.addListener(restoreOnce));
  safe(() => browser.runtime.onInstalled.addListener(restoreOnce));
  restoreOnce();
  cleanupLegacy();
  safe(() => {
    const p = browser.storage.local.get(KEY_ENABLED);
    return p && typeof p.then === 'function'
      ? p.then((r) => applyIcon(r ? r[KEY_ENABLED] : undefined))
      : undefined;
  });
})();
