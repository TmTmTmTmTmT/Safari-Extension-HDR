'use strict';
// 툴바 배지·아이콘 전용 background (PLAN D-M8 M8-5). 상태 저장 없음, 네트워크 없음.
// params.js를 로드하지 않으므로 메시지 타입은 문자열을 직접 비교한다.
(function () {
  const MSG_STATE = 'sdrhdr:state'; // params.MSG.state와 같은 값
  const KEY_ENABLED = 'sdrhdr.enabled'; // params.KEYS.enabled와 같은 값
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

  function onChanged(changes, area) {
    if (area !== 'local' || !changes || !changes[KEY_ENABLED]) return;
    applyIcon(changes[KEY_ENABLED].newValue);
  }

  if (typeof browser === 'undefined') return;
  safe(() => browser.runtime.onMessage.addListener(onMessage));
  safe(() => browser.storage.onChanged.addListener(onChanged));
  safe(() => {
    const p = browser.storage.local.get(KEY_ENABLED);
    return p && typeof p.then === 'function'
      ? p.then((r) => applyIcon(r ? r[KEY_ENABLED] : undefined))
      : undefined;
  });
})();
