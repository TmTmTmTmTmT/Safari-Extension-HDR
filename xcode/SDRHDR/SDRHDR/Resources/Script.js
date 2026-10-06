// 점검 화면. Swift 가 render(state)를 호출하고, 버튼은 고정된 문자열 메시지만 보낸다 (FIX_GUIDE W4 (e)).
// state: { signed, selfVersion, firstRun, versionChanged, selfIsNewest, ambiguous, newestOtherIndex,
//          copies: [{ id, path, version, builtAt, signing }], extEnabled, youtubeConfirmed, notice }

function post(message) {
    window.webkit.messageHandlers.controller.postMessage(message);
}

function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
}

function button(label, message, className) {
    const b = el('button', className, label);
    b.type = 'button';
    b.addEventListener('click', () => post(message));
    return b;
}

function step(status, title, detail) {
    const li = el('li', 'step ' + status);
    li.appendChild(el('span', 'mark', status === 'ok' ? '✓' : status === 'manual' ? '○' : '!'));
    const body = el('div', 'body');
    body.appendChild(el('div', 'title', title));
    if (detail) body.appendChild(el('div', 'detail', detail));
    li.appendChild(body);
    return { li, body };
}

function formatTime(iso) {
    if (!iso) return '알 수 없음';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '알 수 없음';
    const p = (n) => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function describeCopy(c) {
    return '확장 ' + (c.version ? c.version : '버전 알 수 없음') + ' · 빌드 ' + formatTime(c.builtAt);
}

function render(state) {
    const steps = document.getElementById('steps');
    steps.textContent = '';
    let allOk = true;

    document.getElementById('title').textContent =
        state.firstRun ? 'SDR HDR 처음 설정' : state.versionChanged ? 'SDR HDR 업데이트 확인' : 'SDR HDR 상태';
    document.getElementById('subtitle').textContent = state.selfVersion ? '버전 ' + state.selfVersion : '';

    const notice = document.getElementById('notice');
    notice.hidden = !state.notice;
    notice.textContent = state.notice || '';

    // 1. 서명
    if (state.signed) {
        steps.appendChild(
            step('ok', '개인 팀 서명 확인', '개발자 메뉴의 ‘서명되지 않은 확장 허용’은 꺼 두어도 됩니다. (macOS 27.2 · Safari 27.2에서 확인한 동작)').li
        );
    } else {
        allOk = false;
        steps.appendChild(
            step(
                'todo',
                '서명이 필요합니다',
                'Xcode에서 SDRHDR와 SDRHDR Extension 두 타깃 모두 Team을 지정하고 다시 Run하세요. 그 전까지는 Safari를 재시작할 때마다 ‘서명되지 않은 확장 허용’을 켜야 합니다.'
            ).li
        );
    }

    // 2. 사본
    if (state.copies.length === 0) {
        steps.appendChild(step('ok', 'SDR HDR 사본이 1개입니다').li);
    } else {
        allOk = false;
        const s = step('todo', 'SDR HDR 사본이 ' + (state.copies.length + 1) + '개 설치되어 있습니다');
        if (state.selfIsNewest) {
            s.body.appendChild(el('div', 'detail', '이 앱이 가장 최신입니다. 이전 사본을 휴지통으로 옮겨 주세요.'));
        } else if (state.newestOtherIndex !== null) {
            s.body.appendChild(el('div', 'detail', '더 최신 사본이 있습니다. 최신 사본을 열면 거기서 이전 사본을 정리할 수 있습니다.'));
            const row = el('div', 'row');
            row.appendChild(button('최신 사본 열기', 'open-newest'));
            s.body.appendChild(row);
        } else {
            s.body.appendChild(el('div', 'detail', '어느 사본이 최신인지 판단할 수 없습니다. Finder에서 직접 확인해 주세요.'));
        }
        for (const c of state.copies) {
            const item = el('div', 'copy');
            item.appendChild(el('div', 'path', c.path));
            item.appendChild(el('div', 'detail', describeCopy(c)));
            const row = el('div', 'row');
            if (state.selfIsNewest) row.appendChild(button('휴지통으로 이동', 'trash:' + c.id));
            row.appendChild(button('Finder에서 보기', 'reveal:' + c.id));
            item.appendChild(row);
            s.body.appendChild(item);
        }
        steps.appendChild(s.li);
    }

    // 3. 확장 켜짐
    if (state.extEnabled === true) {
        steps.appendChild(step('ok', 'Safari에서 확장이 켜져 있습니다').li);
    } else {
        allOk = false;
        const s = step(
            'todo',
            state.extEnabled === false ? 'Safari에서 확장이 꺼져 있습니다' : '확장 상태를 확인할 수 없습니다',
            'Safari 설정 › 확장 프로그램에서 SDR HDR를 켜 주세요. 설정을 열어도 이 앱은 종료되지 않고, 돌아오면 다시 점검합니다.'
        );
        const row = el('div', 'row');
        row.appendChild(button('Safari 확장 설정 열기', 'open-preferences'));
        s.body.appendChild(row);
        steps.appendChild(s.li);
    }

    // 4. youtube.com 접근 (수동)
    {
        const s = step(
            state.youtubeConfirmed ? 'ok' : 'manual',
            'www.youtube.com 접근 허용 (직접 확인)',
            '확장 설정의 웹사이트 접근에서 ‘허용한 사이트에서’를 고르고 www.youtube.com이 허용 목록에 있는지 확인하세요.'
        );
        const label = el('label', 'check');
        const box = document.createElement('input');
        box.type = 'checkbox';
        box.checked = !!state.youtubeConfirmed;
        box.addEventListener('change', () => post(box.checked ? 'youtube:1' : 'youtube:0'));
        label.appendChild(box);
        label.appendChild(document.createTextNode(' 확인했어요'));
        s.body.appendChild(label);
        if (!state.youtubeConfirmed) allOk = false;
        steps.appendChild(s.li);
    }

    const done = document.getElementById('done');
    done.textContent = allOk ? '시작하기' : '나중에 하고 닫기';
    done.classList.toggle('secondary', !allOk);
}

document.getElementById('done').addEventListener('click', () => post('done'));
