// Safari Web Inspector 콘솔에 붙여 넣어 실행한다. #movie_player와 조상 3단계까지의
// 태그·id·class·data-* 속성만 담은 HTML 골격을 출력한다. 텍스트·이미지·URL·제목은 넣지 않는다.
(function () {
  'use strict';
  const ANCESTOR_LEVELS = 3;
  const INDENT = '  ';
  const VOID_TAGS = ['img', 'input', 'br', 'hr', 'source', 'link', 'meta'];
  const SKIP_TAGS = ['script', 'style', 'svg', 'img', 'iframe', 'canvas'];

  // data-* 값은 URL·제목이 섞일 수 있어 값은 버리고 이름만 남긴다.
  function open(el) {
    const tag = el.tagName.toLowerCase();
    let attrs = '';
    if (el.id) attrs += ' id="' + el.id + '"';
    const cls = el.getAttribute('class');
    if (cls) attrs += ' class="' + cls.replace(/\s+/g, ' ').trim() + '"';
    for (const a of Array.from(el.attributes)) {
      if (a.name.indexOf('data-') === 0) attrs += ' ' + a.name;
    }
    if (tag === 'video' || tag === 'ytd-watch-flexy' || tag === 'ytd-miniplayer') {
      for (const n of ['theater', 'active', 'fullscreen', 'mini']) {
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

  const player = document.querySelector('#movie_player');
  if (!player) {
    console.log('dom-skeleton: #movie_player 없음');
    return;
  }
  // 조상 사슬은 속성만, 형제 서브트리는 제외하고 #movie_player 이하만 전개한다.
  const chain = [];
  for (
    let el = player.parentElement, i = 0;
    el && i < ANCESTOR_LEVELS;
    el = el.parentElement, i++
  ) {
    chain.unshift(el);
  }
  let html = '';
  chain.forEach(function (el, i) {
    html += INDENT.repeat(i) + open(el).text + '\n';
  });
  html += walk(player, chain.length);
  for (let i = chain.length - 1; i >= 0; i--) {
    html += INDENT.repeat(i) + '</' + chain[i].tagName.toLowerCase() + '>\n';
  }

  console.log(html);
  if (typeof copy === 'function') copy(html);
})();
