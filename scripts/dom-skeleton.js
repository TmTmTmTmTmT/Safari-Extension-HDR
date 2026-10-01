// Safari Web Inspector 콘솔에 붙여 넣어 실행한다. #movie_player와 그 조상의 태그·id·class·속성 이름만 담은
// HTML 골격을 출력한다. 텍스트·이미지·URL·제목·속성 값은 넣지 않는다 (PLAN D-M3 M3-8 D3).
(function () {
  'use strict';
  // true면 #movie_player 하위를 모두 전개한다(1,500줄 이상). 기본은 판정에 필요한 부분만.
  const FULL = false;
  const MAX_ANCESTORS = 10;
  // 이 태그 중 하나를 만나면 조상 수집을 멈춘다(극장·미니플레이어·전체화면 속성이 있는 곳).
  const STOP_TAGS = ['ytd-watch-flexy', 'ytd-miniplayer', 'ytd-app'];
  const INDENT = '  ';
  const VOID_TAGS = ['img', 'input', 'br', 'hr', 'source', 'link', 'meta'];
  const SKIP_TAGS = ['script', 'style', 'svg', 'img', 'iframe', 'canvas'];
  // 값은 URL·제목이 섞일 수 있어 이름만 남기는 속성들.
  const STATE_TAGS = ['ytd-app', 'ytd-watch-flexy', 'ytd-miniplayer', 'ytd-player'];
  const STATE_ATTRS = [
    'theater',
    'fullscreen',
    'full-bleed-player',
    'active',
    'miniplayer-is-active',
    'hidden',
  ];
  // FULL=false일 때 #movie_player 아래에서 전개할 하위 트리.
  const KEEP_SELECTORS = [
    '.html5-video-container',
    '.ytp-chrome-bottom .ytp-right-controls',
    '.ytp-settings-menu',
    '.ytp-ad-module',
    '.video-ads',
  ];

  function open(el) {
    const tag = el.tagName.toLowerCase();
    let attrs = '';
    if (el.id) attrs += ' id="' + el.id + '"';
    const cls = el.getAttribute('class');
    if (cls) attrs += ' class="' + cls.replace(/\s+/g, ' ').trim() + '"';
    for (const a of Array.from(el.attributes)) {
      if (a.name.indexOf('data-') === 0) attrs += ' ' + a.name;
    }
    if (STATE_TAGS.indexOf(tag) >= 0) {
      for (const n of STATE_ATTRS) {
        if (el.hasAttribute(n)) attrs += ' ' + n;
      }
    }
    return { tag, text: '<' + tag + attrs + '>' };
  }

  function walk(el, depth) {
    const o = open(el);
    const pad = INDENT.repeat(depth);
    if (VOID_TAGS.indexOf(o.tag) >= 0) return pad + o.text + '\n';
    let out = pad + o.text + '\n';
    for (const child of Array.from(el.children)) {
      if (SKIP_TAGS.indexOf(child.tagName.toLowerCase()) >= 0) continue;
      out += walk(child, depth + 1);
    }
    return out + pad + '</' + o.tag + '>\n';
  }

  // 한정 출력: keep 요소 자체와 그 조상 사슬(#movie_player까지)만 남기고, keep 요소는 전부 전개한다.
  function hasKeep(el, keep) {
    return (
      keep.has(el) ||
      Array.from(keep).some(function (k) {
        return el.contains(k);
      })
    );
  }

  function walkKept(el, depth, keep) {
    if (keep.has(el)) return walk(el, depth);
    const o = open(el);
    const pad = INDENT.repeat(depth);
    let inner = '';
    for (const child of Array.from(el.children)) {
      if (SKIP_TAGS.indexOf(child.tagName.toLowerCase()) >= 0) continue;
      if (hasKeep(child, keep)) inner += walkKept(child, depth + 1, keep);
    }
    return pad + o.text + '\n' + inner + pad + '</' + o.tag + '>\n';
  }

  const player = document.querySelector('#movie_player');
  if (!player) {
    console.log('dom-skeleton: #movie_player 없음');
    return;
  }

  // 조상 사슬은 속성만 남기고 형제 서브트리는 제외한다.
  const chain = [];
  for (let el = player.parentElement, i = 0; el && i < MAX_ANCESTORS; el = el.parentElement, i++) {
    chain.unshift(el);
    if (STOP_TAGS.indexOf(el.tagName.toLowerCase()) >= 0) break;
  }

  let html = '';
  chain.forEach(function (el, i) {
    html += INDENT.repeat(i) + open(el).text + '\n';
  });
  if (FULL) {
    html += walk(player, chain.length);
  } else {
    const keep = new Set();
    KEEP_SELECTORS.forEach(function (sel) {
      player.querySelectorAll(sel).forEach(function (el) {
        keep.add(el);
      });
    });
    const o = open(player);
    html += INDENT.repeat(chain.length) + o.text + '\n';
    for (const child of Array.from(player.children)) {
      if (SKIP_TAGS.indexOf(child.tagName.toLowerCase()) >= 0) continue;
      if (hasKeep(child, keep)) html += walkKept(child, chain.length + 1, keep);
    }
    html += INDENT.repeat(chain.length) + '</' + o.tag + '>\n';
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    html += INDENT.repeat(i) + '</' + chain[i].tagName.toLowerCase() + '>\n';
  }

  console.log(html);
  if (typeof copy === 'function') copy(html);
})();
