/* CLICK SCIENCE 실험실 공통 틀
 * 실험실 파일은 Lab.init({...}) 한 번만 부른다. 화면 뼈대·미션 카드·조작 패널·재생 줄은 여기서 만든다.
 *
 * Lab.init({
 *   id, title, subject:'phys'|'chem'|'life'|'earth', unit, grade, updated, version(미션을 바꾸면 올림),
 *   board:{w:960,h:600},              // 실험판의 논리 크기(그리기 좌표)
 *   state:{...},                      // 조작 값. 「설정을 기본값으로」 누르면 이 값으로 돌아간다
 *   missions:[{
 *     kind:'둘러보기'|'해 보기'|'예상'|'찾아내기', title, text(HTML), hint?, ok?,
 *     check(state,lab)?,              // 참이면 완료(지금 고른 미션만 판정)
 *     enter(lab)?,                    // 카드 안 「이 상황으로 맞추기」 단추가 부른다(카드를 누를 때는 부르지 않음)
 *     predict?:{options:[..], answer?:번호},   // 예상: 고르기 전에는 재생을 막는다
 *     sentence?:'..{가|나}..', blanks?:[정답 번호..],  // 찾아내기: 다 고른 뒤 한꺼번에 채점
 *   }],
 *   teacher:'<h4>..</h4>...',          // 선생님께 창 내용(HTML)
 *   setup(lab), step(dt,lab), draw(ctx,lab),
 *   pointer:{down,move,up,hover},     // 실험판 끌기(p = 논리 좌표). down 이 false 를 돌려주면 끌기 아님
 *   onPlay(lab), rewind(lab), reset(lab), onMissionsReset(lab),
 * })
 */
(function () {
  'use strict';
  const SUBJ = { phys: '물리', chem: '화학', life: '생명', earth: '지구과학' };

  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid));
    return el;
  }
  const clone = o => JSON.parse(JSON.stringify(o));
  const fmtNum = (v, d) => {
    const s = Number(v).toFixed(d);
    return d > 0 ? s : String(Math.round(v));
  };
  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
    del(k) { try { localStorage.removeItem(k); } catch (e) {} },
  };
  const narrow = () => window.matchMedia('(max-width:1180px)').matches;

  const Lab = {};
  window.Lab = Lab;

  Lab.init = function (cfg) {
    const q = new URLSearchParams(location.search);
    const W = (cfg.board && cfg.board.w) || 960, H = (cfg.board && cfg.board.h) || 600;
    const missions = cfg.missions || [];
    const KEY = 'cs-lab-' + cfg.id + (cfg.version ? '-v' + cfg.version : '');   // 미션을 바꾸면 version 을 올린다
    const lab = {
      cfg, W, H,
      state: clone(cfg.state || {}),
      initial: clone(cfg.state || {}),
      running: false, speed: 1, t: 0, touches: 0,
      mi: 0, done: [], preds: [], prediction: undefined,
    };
    document.body.dataset.subject = cfg.subject || 'phys';
    document.title = cfg.title + ' · CLICK SCIENCE';

    // ── 뼈대
    const mToggle = h('button', { class: 'tbtn m-toggle', onclick: () => { root.classList.remove('no-missions'); root.classList.toggle('m-open'); } }, '미션');
    const teachDlg = h('dialog', { class: 'teach' });
    const root = h('div', { class: 'lab' },
      h('header', { class: 'lab-top' },
        h('a', { class: 'lab-back', href: '../../', title: 'CLICK SCIENCE 처음으로' }, '◀ ', h('b', null, 'CLICK'), h('span', null, ' SCIENCE')),
        missions.length ? mToggle : null,
        h('div', { class: 'lab-title' }, h('h1', null, cfg.title), h('span', null, `${SUBJ[cfg.subject] || ''} · ${cfg.unit || ''}${cfg.grade ? ' · ' + cfg.grade : ''}`)),
        cfg.teacher ? h('button', { class: 'tbtn', onclick: () => teachDlg.showModal() }, '선생님께') : null,
        h('button', { class: 'tbtn icon', title: '전체 화면', 'aria-label': '전체 화면', onclick: toggleFull }, '⛶'),
      ),
    );
    const mList = h('div', { class: 'm-list' });
    const mProg = h('span', { class: 'prog num' });
    const smallBtn = 'height:30px;padding:0 10px;font-size:12.5px';
    const missionsEl = h('aside', { class: 'lab-missions' },
      h('div', { class: 'm-head' }, h('b', null, '미션'), mProg,
        h('span', { style: 'flex:1' }),
        h('button', { class: 'tbtn', style: smallBtn, title: '미션 진행을 처음부터', onclick: resetMissions }, '다시 하기'),
        h('button', { class: 'tbtn', style: smallBtn, onclick: () => narrow() ? root.classList.remove('m-open') : setMissions(false) }, '접기')),
      mList,
      h('div', { class: 'm-foot' }, '미션은 순서대로 하지 않아도 됩니다. 카드를 눌러 골라 보세요.'));
    // 좁은 화면: 실험판 위에 지금 미션 한 줄
    const nowEl = h('div', { class: 'm-now', role: 'button', tabindex: '0', onclick: e => { if (!e.target.closest('button')) nowEl.classList.toggle('open'); } });
    const canvas = h('canvas', { class: 'board', role: 'img', 'aria-label': cfg.title + ' 실험판' });
    const boardWrap = h('div', { class: 'board-wrap' }, canvas);
    const playBtn = h('button', { class: 'pbtn main', onclick: () => setRunning(!lab.running) }, '▶ 재생');
    const speedEl = h('div', { class: 'speed', role: 'group', 'aria-label': '빠르기' },
      [[0.25, '아주 느리게'], [0.5, '느리게'], [1, '보통']].map(([v, t]) =>
        h('button', { class: v === 1 ? 'on' : '', onclick: e => { lab.speed = v; [...speedEl.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, t)));
    const rewindBtn = h('button', { class: 'pbtn', title: '지금 설정 그대로 처음 자리에서', onclick: () => lab.rewind() }, '↺ 처음부터');
    const missionBtn = h('button', { class: 'pbtn', onclick: () => setMissions(true), style: 'display:none' }, '미션 펴기');
    const play = h('div', { class: 'play' }, cfg.step ? [playBtn, speedEl] : null, rewindBtn, missionBtn);
    const stage = h('section', { class: 'lab-stage' }, missions.length ? nowEl : null, boardWrap, play);
    const panel = h('aside', { class: 'lab-panel', 'aria-label': '조작 패널' });
    root.append(h('div', { class: 'lab-main' }, missionsEl, stage, panel));
    document.body.prepend(root);
    document.body.append(teachDlg);
    if (cfg.teacher) {
      teachDlg.append(h('div', { class: 'teach-in' },
        h('button', { class: 'teach-x', 'aria-label': '닫기', onclick: () => teachDlg.close() }, '×'),
        h('h2', null, '선생님께'), h('div', { html: cfg.teacher })));
      teachDlg.addEventListener('click', e => { if (e.target === teachDlg) teachDlg.close(); });
    }

    function toggleFull() {
      if (document.fullscreenElement) document.exitFullscreen();
      else (document.documentElement.requestFullscreen || function () {}).call(document.documentElement);
    }
    function setMissions(on) {
      root.classList.toggle('no-missions', !on);
      root.classList.remove('m-open');
      missionBtn.style.display = on || !missions.length ? 'none' : '';
      fit();
    }
    function setRunning(on) {
      if (on && playLocked()) return;
      if (on && !lab.running && cfg.onPlay) cfg.onPlay(lab);
      lab.running = on;
      playBtn.textContent = on ? '⏸ 멈춤' : '▶ 재생';
    }
    lab.setRunning = setRunning;
    const curM = () => missions[lab.mi];
    function playLocked() { const m = curM(); return !!(m && m.predict && !lab.done[lab.mi] && lab.prediction == null); }

    // ── 실험판 크기: 논리 크기 W×H 를 비율 그대로 맞춰 넣고, CSS 크기를 꼭 적는다(캔버스 폭주 방지)
    const ctx = canvas.getContext('2d');
    let scale = 1;
    function fit() {
      // html zoom(발표 크기)이 걸리면 getBoundingClientRect 는 확대된 값을 준다 → CSS 크기로 되돌려 쓴다
      const z = parseFloat(getComputedStyle(document.documentElement).zoom) || 1;
      const r = boardWrap.getBoundingClientRect();
      const rw = r.width / z, rh = r.height / z;
      const pad = 24;
      const aw = Math.max(200, Math.min(rw - pad, 2400));
      const ah = window.matchMedia('(max-width:760px)').matches ? aw * H / W : Math.max(150, Math.min(rh - pad, 1600));
      const s = Math.min(aw / W, ah / H);
      const cw = Math.floor(W * s), ch = Math.floor(H * s);
      canvas.style.width = cw + 'px';
      canvas.style.height = ch + 'px';
      const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
      scale = s * dpr;
      lab.px = s; // 논리 1px 이 화면에서 몇 CSS px 인지(글자 최소 크기 계산용)
      lab.dirty = true;
    }
    new ResizeObserver(fit).observe(boardWrap);
    window.addEventListener('resize', fit);

    // ── 끌기: 비율로 환산해 zoom·전체 화면과 상관없이 논리 좌표를 준다
    function toLogical(e) {
      const r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
    }
    let dragging = false;
    canvas.addEventListener('pointerdown', e => {
      if (!cfg.pointer || !cfg.pointer.down) return;
      if (cfg.pointer.down(toLogical(e), lab) !== false) {
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
        lab.touch();
      }
    });
    canvas.addEventListener('pointermove', e => {
      if (!cfg.pointer) return;
      const p = toLogical(e);
      if (dragging && cfg.pointer.move) { cfg.pointer.move(p, lab); lab.update(); }
      else if (cfg.pointer.hover) canvas.style.cursor = cfg.pointer.hover(p, lab) ? 'grab' : 'default';
    });
    const endDrag = e => {
      if (!dragging) return;
      dragging = false;
      try { canvas.releasePointerCapture(e.pointerId); } catch (err) {}
      if (cfg.pointer && cfg.pointer.up) cfg.pointer.up(toLogical(e), lab);
      lab.update();
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    // ── 조작 패널 부품: 값은 lab.state[key] 에 바로 묶인다
    const bound = [];
    let curGroup = panel;
    lab.ui = {
      group(title, color) {
        curGroup = h('div', { class: 'grp' }, h('h3', null, color ? h('i', { style: 'background:' + color }) : null, title));
        panel.append(curGroup);
        return curGroup;
      },
      slider(o) {
        const d = o.digits != null ? o.digits : (String(o.step).split('.')[1] || '').length;
        const out = h('output', { class: 'num' });
        const inp = h('input', { type: 'range', min: o.min, max: o.max, step: o.step, 'aria-label': o.label });
        const set = v => {
          v = Math.min(o.max, Math.max(o.min, Math.round(v / o.step) * o.step));
          lab.state[o.key] = +v.toFixed(6);
          lab.touch(); if (o.onChange) o.onChange(lab.state[o.key], lab); lab.update();
        };
        inp.addEventListener('input', () => set(+inp.value));
        // ± 단추: 누르면 한 칸, 길게 누르면 계속(키보드 Enter/Space 도 한 칸)
        const stepBtn = (sign, label) => {
          let timer = null, rep = null;
          const stop = () => { clearTimeout(timer); clearInterval(rep); timer = rep = null; };
          const b = h('button', { 'aria-label': o.label + label,
            onpointerdown: e => { if (b.disabled) return; e.preventDefault(); set(lab.state[o.key] + sign * o.step); timer = setTimeout(() => { rep = setInterval(() => set(lab.state[o.key] + sign * o.step), 90); }, 420); },
            onpointerup: stop, onpointerleave: stop, onpointercancel: stop,
            onclick: e => { if (e.detail === 0) set(lab.state[o.key] + sign * o.step); } }, sign < 0 ? '−' : '+');
          return b;
        };
        const minus = stepBtn(-1, ' 줄이기'), plus = stepBtn(1, ' 늘리기');
        const el = h('div', { class: 'ctl' },
          h('div', { class: 'ctl-l' }, h('span', null, o.label), out),
          h('div', { class: 'srow' }, minus, inp, plus));
        bound.push(() => {
          const v = lab.state[o.key];
          if (+inp.value !== v) inp.value = v;
          out.textContent = o.fmt ? o.fmt(v) : fmtNum(v, d) + (o.unit ? ' ' + o.unit : '');
          if (o.disabled) { const dis = !!o.disabled(lab.state); inp.disabled = minus.disabled = plus.disabled = dis; el.style.opacity = dis ? .45 : 1; }
          if (o.hide) el.style.display = o.hide(lab.state) ? 'none' : '';
        });
        (o.parent || curGroup).append(el);
        return el;
      },
      choice(o) {
        const seg = h('div', { class: 'seg', role: 'group', 'aria-label': o.label || '' },
          o.options.map(([v, t]) => h('button', { 'data-v': JSON.stringify(v), onclick: () => { lab.state[o.key] = v; lab.touch(); if (o.onChange) o.onChange(v, lab); lab.update(); } }, t)));
        const el = h('div', { class: 'ctl' }, o.label ? h('div', { class: 'ctl-l' }, h('span', null, o.label)) : null, seg);
        bound.push(() => [...seg.children].forEach(b => b.classList.toggle('on', b.dataset.v === JSON.stringify(lab.state[o.key]))));
        (o.parent || curGroup).append(el);
        return el;
      },
      toggle(o) {
        const inp = h('input', { type: 'checkbox', role: 'switch' });
        inp.addEventListener('change', () => { lab.state[o.key] = inp.checked; lab.touch(); lab.update(); });
        const el = h('label', { class: 'tog' }, h('span', null, o.label), inp);
        bound.push(() => { inp.checked = !!lab.state[o.key]; });
        (o.parent || curGroup).append(el);
        return el;
      },
      readout(o) {
        const b = h('b', { class: 'num' });
        const el = h('div', { class: 'rd' }, h('span', null, o.label), b);
        bound.push(() => { b.innerHTML = o.get(lab.state, lab); if (o.color) b.style.color = typeof o.color === 'function' ? o.color(lab.state) : o.color; });
        (o.parent || curGroup).append(el);
        return el;
      },
      button(o) {
        const el = h('button', { class: 'abtn', onclick: () => { lab.touch(); o.onClick(lab); lab.update(); } }, o.label);
        (o.parent || curGroup).append(el);
        return el;
      },
      note(text) { const el = h('p', { class: 'pnote' }, text || ''); curGroup.append(el); return el; },
      el: h,
    };

    // ── 미션 카드
    let cards = [];
    function renderCards() {
      mList.innerHTML = '';
      cards = missions.map((m, i) => {
        const body = h('div', { class: 'd' });
        body.append(h('div', { html: m.text }));
        if (m.enter) body.append(h('button', { class: 'enter-btn', onclick: () => { lab.touch(); m.enter(lab); lab.update(); closeDrawerSoon(); } }, '이 상황으로 실험판 맞추기'));
        if (m.sentence) body.append(renderBlanks(m, i));
        if (m.predict) body.append(renderPredict(m, i));
        if (m.hint) body.append(h('div', { class: 'hint' }, '💡 ' + m.hint));
        const okText = h('span', { class: 'ok-t' });
        const nextBtn = h('button', { class: 'next-btn', onclick: () => { const n = nextUndone(i); if (n >= 0) select(n); } }, '다음 미션 ▶');
        const okBox = h('div', { class: 'ok-msg' }, okText, nextBtn);
        const card = h('div', { class: 'mcard', role: 'button', tabindex: '0', 'aria-label': `미션 ${i + 1} ${m.title}`,
          onclick: e => { if (!e.target.closest('.blank,.pred,button')) select(i); },
          onkeydown: e => { if (e.key === 'Enter' && e.target === e.currentTarget) select(i); } },
          h('div', { class: 'k' }, h('i', null, h('span', null, String(i + 1))), m.kind),
          h('div', { class: 't' }, m.title), body, okBox);
        card._ok = okText; card._next = nextBtn;
        mList.append(card);
        return card;
      });
      cards.forEach((c, i) => { c.classList.toggle('done', lab.done[i]); if (lab.done[i]) setOk(i); });
      renderProg();
    }
    function closeDrawerSoon() { if (narrow()) setTimeout(() => root.classList.remove('m-open'), 400); }
    function nextUndone(i) {
      for (let k = 1; k <= missions.length; k++) { const j = (i + k) % missions.length; if (!lab.done[j]) return j; }
      return -1;
    }
    function setOk(i) {
      const m = missions[i];
      let pre = '';
      if (m.predict && m.predict.answer != null && lab.preds[i] != null) pre = lab.preds[i] === m.predict.answer ? '예상이 맞았어요! ' : '예상과 달랐어요. 무엇이 달랐는지 떠올려 보세요. ';
      cards[i]._ok.textContent = '✓ ' + pre + (m.ok || '해냈어요!');
      cards[i]._next.style.display = nextUndone(i) >= 0 ? '' : 'none';
    }
    function renderBlanks(m, i) {
      // 문장 속 {가|나|다} 를 고르기 칸으로 바꾼다. 네 칸을 다 고르면 한꺼번에 채점한다
      const wrap = h('div', { class: 'blanks' });
      const boxes = [];
      const parts = m.sentence.split(/(\{[^}]+\})/);
      parts.forEach((part, pi) => {
        const mm = part.match(/^\{([^}]+)\}$/);
        if (!mm) {
          if (pi > 0 && /^\{/.test(parts[pi - 1] || '')) part = part.replace(/^[,.!?)]+/, '');
          if (part) wrap.append(part);
          return;
        }
        const idx = boxes.length;
        const box = h('span', { class: 'blank' });
        mm[1].split('|').forEach((o, oi) => box.append(h('button', {
          onclick: e => {
            [...box.children].forEach(b => b.classList.remove('sel', 'wrong'));
            e.currentTarget.classList.add('sel');
            box.dataset.pick = oi;
            wrap.classList.remove('right');
            grade();
          },
        }, o)));
        boxes.push(box);
        // 빈칸 바로 뒤의 문장부호는 줄이 바뀌어도 빈칸에 붙어 있게 한다
        const punct = ((parts[pi + 1] || '').match(/^[,.!?)]+/) || [''])[0];
        wrap.append(punct ? h('span', { class: 'nowrap' }, box, punct) : box);
      });
      function grade() {
        if (!boxes.every(b => b.dataset.pick != null)) return;
        let ok = true;
        boxes.forEach((b, k) => {
          const sel = b.querySelector('.sel');
          if (+b.dataset.pick !== m.blanks[k]) { ok = false; if (sel) { sel.classList.remove('wrong'); void sel.offsetWidth; sel.classList.add('wrong'); } }
        });
        if (ok) { wrap.classList.add('right'); complete(i); }
      }
      return h('div', null, wrap, h('div', { class: 'pred-note' }, '빈칸을 모두 고르면 한꺼번에 확인해요.'));
    }
    function renderPredict(m, i) {
      const note = h('div', { class: 'pred-note' }, '먼저 하나를 고르세요. 고르면 재생할 수 있어요. 틀려도 괜찮아요.');
      const box = h('div', { class: 'pred' }, m.predict.options.map((o, oi) => h('button', {
        onclick: e => {
          if (lab.done[i]) return;
          [...box.children].forEach(b => b.classList.remove('sel'));
          e.currentTarget.classList.add('sel');
          lab.preds[i] = oi;
          if (lab.mi === i) lab.prediction = oi;
          note.textContent = '좋아요. 이제 ▶ 재생으로 확인해 보세요.';
          lab.update();
          closeDrawerSoon();
        },
      }, o)));
      return h('div', null, box, note);
    }
    function select(i) {
      lab.mi = i;
      lab.prediction = lab.preds[i];
      cards.forEach((c, k) => c.classList.toggle('on', k === i));
      if (cards[i]) cards[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      root.classList.remove('m-open');
      lab.update();
    }
    function complete(i) {
      if (lab.done[i]) return;
      lab.done[i] = true;
      cards[i].classList.add('done');
      setOk(i);
      store.set(KEY, lab.done);
      renderProg();
      if (cfg.onComplete) cfg.onComplete(i, lab);
      lab.update();
    }
    function renderProg() { mProg.textContent = `${lab.done.filter(Boolean).length} / ${missions.length}`; }
    function resetMissions() {
      lab.done = missions.map(() => false);
      lab.preds = []; lab.prediction = undefined;
      store.del(KEY);
      if (cfg.onMissionsReset) cfg.onMissionsReset(lab);
      renderCards();
      select(0);
    }
    let nowKey = '';
    function renderNow() {
      const m = curM();
      if (!m) return;
      const done = lab.done[lab.mi];
      const key = [lab.mi, done, lab.done.filter(Boolean).length].join('|');
      if (key === nowKey) return;
      nowKey = key;
      nowEl.innerHTML = '';
      nowEl.append(
        h('div', { class: 'now-top' },
          h('span', { class: 'now-k' + (done ? ' done' : '') }, done ? '✓' : String(lab.mi + 1)),
          h('b', null, m.title),
          h('span', { class: 'now-prog num' }, `${lab.done.filter(Boolean).length}/${missions.length}`),
          h('button', { class: 'tbtn', style: smallBtn, onclick: () => { root.classList.remove('no-missions'); root.classList.add('m-open'); } }, m.sentence || m.predict ? '고르러 가기' : '미션 목록')),
        h('div', { class: 'now-d', html: done ? cards[lab.mi]._ok.textContent : m.text }));
      nowEl.classList.toggle('is-done', !!done);
    }
    lab.complete = complete;
    lab.done = missions.map((_, i) => { const s = store.get(KEY); return !!(s && s[i]); });
    renderCards();
    if (!missions.length || q.get('missions') === 'off') setMissions(false);

    // ── 갱신: 조작이 바뀌면 패널 값을 다시 쓰고 지금 미션을 확인한다
    lab.touch = () => { lab.touches++; };
    lab.update = () => {
      bound.forEach(f => f());
      const m = curM();
      if (m && !lab.done[lab.mi]) {
        let ok = false;
        if (m.check) ok = !!m.check(lab.state, lab);
        else if (m.kind === '둘러보기') ok = lab.touches >= (m.touches || 5);
        if (ok) { complete(lab.mi); return; }
      }
      const locked = playLocked();
      playBtn.disabled = locked && !lab.running;
      playBtn.title = locked ? '미션 카드에서 먼저 예상을 골라요' : '';
      renderNow();
      lab.dirty = true;
    };
    // 처음부터: 설정은 그대로 두고 실험만 처음 자리로
    lab.rewind = () => {
      setRunning(false);
      lab.t = 0;
      if (cfg.rewind) cfg.rewind(lab); else if (cfg.reset) cfg.reset(lab);
      lab.update();
    };
    // 설정을 기본값으로
    lab.reset = () => {
      lab.state = clone(lab.initial);
      lab.t = 0; lab.touches = 0;
      setRunning(false);
      if (cfg.reset) cfg.reset(lab);
      lab.update();
    };

    lab.ctx = ctx;
    lab.draw = Lab.draw;
    // 작은 화면에서도 읽히는 글자 크기(논리 px): 화면에서 최소 11 CSS px
    lab.fs = size => Math.max(size, 11 / (lab.px || 1));

    if (cfg.setup) cfg.setup(lab);
    panel.append(h('button', { class: 'reset-btn', onclick: () => lab.reset() }, '설정을 기본값으로'));
    const first = lab.done.findIndex(d => !d);
    select(first >= 0 ? first : 0);
    fit();

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (lab.running && cfg.step) {
        const sdt = dt * lab.speed;
        lab.t += sdt;
        cfg.step(sdt, lab);
        bound.forEach(f => f());
        lab.dirty = true;
      }
      if (lab.dirty || cfg.animate) {
        ctx.setTransform(scale, 0, 0, scale, 0, 0);
        ctx.clearRect(0, 0, W, H);
        if (cfg.draw) cfg.draw(ctx, lab);
        lab.dirty = false;
      }
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);

    // 표준 푸터
    document.body.append(h('footer', { id: 'app-credit', style: "width:100%;box-sizing:border-box;margin:2.5rem 0 0;padding:14px 12px;text-align:center;font-size:12.5px;line-height:1.6;color:#8a8f98;font-family:system-ui,-apple-system,'Segoe UI','Malgun Gothic',sans-serif;border-top:1px solid rgba(128,128,128,.25);", html: '제작 : 과학을 사랑하는 선생님 · © 2026 · All rights reserved<br><span style="font-size:11px;opacity:.85;">최종 업데이트: ' + (cfg.updated || '') + '</span>' }));

    window.lab = lab; // 점검용
    return lab;
  };

  // ── 그리기 도구: 모든 실험실이 같은 모양의 화살표·글자·그래프를 쓴다
  const css = name => getComputedStyle(document.body).getPropertyValue(name).trim() || '#111';
  Lab.color = css;
  Lab.draw = {
    // 힘 화살표: (x,y)=작용점, (dx,dy)=길이·방향
    arrow(ctx, x, y, dx, dy, o = {}) {
      const len = Math.hypot(dx, dy);
      if (len < 0.5) return;
      const w = o.width || 6, head = Math.min(o.head || 18, len * 0.9);
      const ux = dx / len, uy = dy / len;
      const bx = x + dx - ux * head, by = y + dy - uy * head;
      ctx.save();
      ctx.fillStyle = ctx.strokeStyle = o.color || '#111';
      ctx.lineWidth = w; ctx.lineCap = 'butt';
      if (o.dash) ctx.setLineDash(o.dash);
      if (len > head) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(bx, by); ctx.stroke(); }
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x + dx, y + dy);
      ctx.lineTo(bx - uy * head * 0.55, by + ux * head * 0.55);
      ctx.lineTo(bx + uy * head * 0.55, by - ux * head * 0.55);
      ctx.closePath(); ctx.fill();
      if (o.dot !== false) { ctx.beginPath(); ctx.arc(x, y, w * 0.9, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
      if (o.label) {
        const side = o.labelSide || 1;
        const lx = x + dx * (o.labelAt != null ? o.labelAt : 0.5) - uy * (o.labelOff || 22) * side;
        const ly = y + dy * (o.labelAt != null ? o.labelAt : 0.5) + ux * (o.labelOff || 22) * side;
        Lab.draw.tag(ctx, lx, ly, o.label, { color: o.color, size: o.labelSize });
      }
    },
    // 흰 바탕 글자표: 선 위에 겹쳐도 읽힌다
    tag(ctx, x, y, text, o = {}) {
      ctx.save();
      const size = o.size || 17;
      ctx.font = `700 ${size}px Pretendard, "Malgun Gothic", sans-serif`;
      ctx.textAlign = o.align || 'center'; ctx.textBaseline = 'middle';
      const w = ctx.measureText(text).width + 12, hh = size + 8;
      const x0 = ctx.textAlign === 'center' ? x - w / 2 : ctx.textAlign === 'left' ? x - 6 : x - w + 6;
      ctx.fillStyle = o.bg || 'rgba(255,255,255,.92)';
      ctx.beginPath(); ctx.roundRect(x0, y - hh / 2, w, hh, 6); ctx.fill();
      ctx.fillStyle = o.color || '#111';
      ctx.fillText(text, x, y + 1);
      ctx.restore();
    },
    text(ctx, x, y, text, o = {}) {
      ctx.save();
      ctx.font = `${o.weight || 600} ${o.size || 16}px Pretendard, "Malgun Gothic", sans-serif`;
      ctx.fillStyle = o.color || '#4b5563';
      ctx.textAlign = o.align || 'left'; ctx.textBaseline = o.base || 'alphabetic';
      ctx.fillText(text, x, y);
      ctx.restore();
    },
    // 간단한 좌표 그래프. pts=[[x,y],...]
    graph(ctx, g) {
      const { x, y, w, h } = g;
      ctx.save();
      ctx.fillStyle = '#fff'; ctx.fillRect(x, y, w, h);
      ctx.strokeStyle = '#e3e7ee'; ctx.lineWidth = 1;
      const nx = g.xTicks || 5, ny = g.yTicks || 5;
      for (let i = 0; i <= nx; i++) { const px = x + w * i / nx; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y + h); ctx.stroke(); }
      for (let i = 0; i <= ny; i++) { const py = y + h - h * i / ny; ctx.beginPath(); ctx.moveTo(x, py); ctx.lineTo(x + w, py); ctx.stroke(); }
      ctx.strokeStyle = '#6b7280'; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + h); ctx.lineTo(x + w, y + h); ctx.stroke();
      ctx.fillStyle = '#6b7280'; ctx.font = '600 13px Pretendard, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i <= nx; i++) ctx.fillText(fmtNum(g.xMax * i / nx, g.xDigits || 0), x + w * i / nx, y + h + 5);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let i = 0; i <= ny; i++) ctx.fillText(fmtNum(g.yMax * i / ny, g.yDigits || 0), x - 6, y + h - h * i / ny);
      ctx.fillStyle = '#374151'; ctx.font = '700 14px Pretendard, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(g.xLabel || '', x + w / 2, y + h + 24);
      ctx.save(); ctx.translate(x - 44, y + h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(g.yLabel || '', 0, 0); ctx.restore();
      const P = ([px, py]) => [x + w * px / g.xMax, y + h - h * py / g.yMax];
      if (g.line && g.line.length > 1) {
        ctx.strokeStyle = g.lineColor || g.color || '#2563eb'; ctx.lineWidth = 2.5; ctx.setLineDash(g.lineDash || []);
        ctx.beginPath(); g.line.forEach((pt, i) => { const [a, b] = P(pt); i ? ctx.lineTo(a, b) : ctx.moveTo(a, b); }); ctx.stroke();
        ctx.setLineDash([]);
      }
      (g.pts || []).forEach(pt => { const [a, b] = P(pt); ctx.fillStyle = g.color || '#2563eb'; ctx.beginPath(); ctx.arc(a, b, 6, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke(); });
      ctx.restore();
    },
  };
})();
