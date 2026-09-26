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
 *   assumptions:[학생용 문장], quiz:[{kind,question,options:[문장],answer,feedback:[문장]}],
 *   onModeChange(lab), onMissionSelect(lab), // 모형/학습 전환과 미션 선택 시 휘발성 증거 정리
 *   missions[].variables:{options:[[key,label]],change,keep:[key],measure,recordId,minRows?}
 * })
 * lab.mode = 'model'|'learn'; lab.modelVisible = 화살표/설명 층. state.mode와 별개다.
 * lab.ui.learnOnly(el), lab.ui.records({id,version,columns:[{key,label,numeric?,digits?,format?}],
 *   conditions:[key],measure:key,x:key,y:key,validate(row)?}) -> {rows,add,clear,exportCSV,summary}
 * lab.measure(id,value,{amplitude,fresh?,zero?})는 표시/기록 전용. 물리 계산에 넣지 않는다.
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
    const chosenMode = q.get('mode') || (q.get('missions') === 'off' ? 'model' : store.get('cs-mode-v1'));
    const lab = {
      cfg, W, H,
      state: clone(cfg.state || {}),
      initial: clone(cfg.state || {}),
      running: false, speed: 1, t: 0, touches: 0,
      mi: 0, done: [], preds: [], prediction: undefined,
      mode: chosenMode === 'learn' ? 'learn' : 'model', modelVisible: true,
      recordBooks: {}, designs: {},
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
    const canvas = h('canvas', { class: 'board', role: 'img', 'aria-label': cfg.title + ' 실험판. 조작 패널에서도 키보드로 조작할 수 있습니다.' });
    const boardWrap = h('div', { class: 'board-wrap' }, canvas);
    const playBtn = h('button', { class: 'pbtn main', onclick: () => setRunning(!lab.running) }, '▶ 재생');
    const speedEl = h('div', { class: 'speed', role: 'group', 'aria-label': '빠르기' },
      [[0.25, '아주 느리게'], [0.5, '느리게'], [1, '보통']].map(([v, t]) =>
        h('button', { class: v === 1 ? 'on' : '', onclick: e => { lab.speed = v; [...speedEl.children].forEach(b => b.classList.toggle('on', b === e.currentTarget)); } }, t)));
    const rewindBtn = h('button', { class: 'pbtn', title: '지금 설정 그대로 처음 자리에서', onclick: () => lab.rewind() }, '↺ 처음부터');
    const missionBtn = h('button', { class: 'pbtn learn-only', onclick: () => setMissions(true), style: 'display:none' }, '미션 펴기');
    const play = h('div', { class: 'play' }, cfg.step ? [playBtn, speedEl] : null, rewindBtn, missionBtn);
    const stage = h('section', { class: 'lab-stage' }, missions.length ? nowEl : null, boardWrap, play);
    const panel = h('aside', { class: 'lab-panel', 'aria-label': '조작 패널' });
    root.append(h('div', { class: 'lab-main' }, missionsEl, stage, panel));
    document.body.prepend(root);
    document.body.append(teachDlg);
    let learnMi = 0;
    const modeBar = h('div', { class: 'mode-switch', role: 'group', 'aria-label': '실험실 모드' },
      ['model', 'learn'].map(mode => h('button', { 'data-mode': mode, onclick: () => lab.setMode(mode) }, mode === 'model' ? '모형' : '학습')));
    root.querySelector('.lab-top').append(modeBar);
    const modelButton = h('button', { class: 'pbtn model-view', onclick: () => {
      lab.modelVisible = !lab.modelVisible; syncMode(); lab.update();
    } }, '');
    play.prepend(modelButton);
    const sceneNote = h('p', { class: 'scene-note' }, '화살표를 끄면 물체와 장치의 모습이 보입니다. 실제 장면을 단순하게 그린 모형입니다.' + (cfg.sceneNote ? ' '+cfg.sceneNote : ''));
    stage.append(sceneNote);
    function syncMode() {
      root.dataset.mode = lab.mode;
      [...modeBar.children].forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === lab.mode)));
      modelButton.textContent = lab.modelVisible ? '모형 켜짐 · 실제 모습 보기' : '실제 모습 · 모형 켜기';
      modelButton.setAttribute('aria-pressed', String(lab.modelVisible));
      if (lab.mode === 'model') root.classList.remove('m-open');
      fit();
    }
    lab.setMode = mode => {
      if (!['model', 'learn'].includes(mode)) return;
      setRunning(false);
      if (lab.mode === 'learn') learnMi = lab.mi;
      lab.mode = mode;
      lab.mi = mode === 'learn' ? learnMi : -1;
      lab.prediction = mode === 'learn' ? lab.preds[lab.mi] : undefined;
      lab.touches = 0;
      lab.designs = {};
      if (cfg.onModeChange) cfg.onModeChange(lab);
      renderCards(); cards.forEach((c,i) => c.classList.toggle('on',i===lab.mi));
      store.set('cs-mode-v1', mode);
      const url = new URL(location); url.searchParams.set('mode', mode); history.replaceState(null, '', url);
      syncMode(); lab.update();
    };
    function showInfo(title, items) {
      const dlg = h('dialog', { class: 'teach', 'aria-label': title });
      dlg.append(h('div', { class: 'teach-in' }, h('button', { class: 'teach-x', 'aria-label': '닫기', onclick: () => dlg.close() }, '×'),
        h('h2', null, title), h('ul', null, items.map(t => h('li', null, t)))));
      document.body.append(dlg); dlg.addEventListener('close', () => dlg.remove()); dlg.showModal();
    }
    if (cfg.assumptions) root.querySelector('.lab-top').append(h('button', { class: 'tbtn assumptions', onclick: () => showInfo('이 실험실의 가정', cfg.assumptions) }, '가정'));
    nowEl.addEventListener('keydown', e => { if (e.target === nowEl && ['Enter', ' '].includes(e.key)) { e.preventDefault(); nowEl.classList.toggle('open'); } });
    root.addEventListener('keydown', e => { if (e.key === 'Escape') { root.classList.remove('m-open'); mToggle.focus(); } });
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
    function playLocked() { const m = curM(); return lab.mode === 'learn' && !!(m && m.predict && !lab.done[lab.mi] && lab.prediction == null); }

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
      if (!lab.modelVisible) return;
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
            onpointerup: stop, onpointerleave: stop, onpointercancel: stop, onblur: stop,
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
        bound.push(() => [...seg.children].forEach(b => { const on = b.dataset.v === JSON.stringify(lab.state[o.key]); b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); }));
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
        bound.push(() => { b.innerHTML = o.get(lab.state, lab); if (o.color) b.style.color = typeof o.color === 'function' ? o.color(lab.state) : o.color; if(o.hide)el.hidden=!!o.hide(lab.state); });
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
      learnOnly(el) { el.classList.add('learn-only'); return el; },
    };
    installLearning(lab, { h, store, KEY, panel, bound, parent: () => curGroup });

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
        if (m.variables) body.append(lab.renderVariables(m, i));
        if (m.hint) body.append(h('div', { class: 'hint' }, '💡 ' + m.hint));
        const okText = h('span', { class: 'ok-t' });
        const nextBtn = h('button', { class: 'next-btn', onclick: () => { const n = nextUndone(i); if (n >= 0) select(n); } }, '다음 미션 ▶');
        const okBox = h('div', { class: 'ok-msg' }, okText, nextBtn);
        const card = h('div', { class: 'mcard', role: 'button', tabindex: '0', 'aria-label': `미션 ${i + 1} ${m.title}`,
          onclick: e => { if (!e.target.closest('.blank,.pred,button,select,input,label')) select(i); },
          onkeydown: e => { if (['Enter', ' '].includes(e.key) && e.target === e.currentTarget) { e.preventDefault(); select(i); } } },
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
      const note = h('div', { class: 'pred-note' }, lab.preds[i] == null ? '먼저 하나를 고르세요. 고르면 재생할 수 있어요. 틀려도 괜찮아요.' : '고른 예상이 남아 있습니다. ▶ 재생으로 확인해 보세요.');
      const box = h('div', { class: 'pred' }, m.predict.options.map((o, oi) => h('button', {
        class: lab.preds[i] === oi ? 'sel' : '', 'aria-pressed': String(lab.preds[i] === oi),
        onclick: e => {
          if (lab.done[i]) return;
          [...box.children].forEach(b => { b.classList.remove('sel'); b.setAttribute('aria-pressed','false'); });
          e.currentTarget.classList.add('sel');
          e.currentTarget.setAttribute('aria-pressed','true');
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
      if (lab.mode === 'learn' && missions[i] && missions[i].predict && lab.preds[i] == null) setRunning(false);
      if (lab.mi !== i && cfg.onMissionSelect) cfg.onMissionSelect(lab);
      learnMi = i;
      lab.mi = lab.mode === 'learn' ? i : -1;
      lab.prediction = lab.preds[i];
      cards.forEach((c, k) => c.classList.toggle('on', k === i));
      if (cards[i]) cards[i].scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      root.classList.remove('m-open');
      lab.update();
    }
    function complete(i) {
      if (lab.mode !== 'learn' || i !== lab.mi || lab.done[i]) return;
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
      lab.designs = {}; lab.touches = 0;
      Object.values(lab.recordBooks).forEach(book => book.clear());
      lab.resetQuiz();
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
    lab.touch = () => { if (lab.mode === 'learn') lab.touches++; };
    lab.update = () => {
      bound.forEach(f => f());
      const m = curM();
      if (lab.mode === 'learn' && m && !lab.done[lab.mi]) {
        let ok = false;
        if (m.variables) ok = lab.checkVariables(m, lab.mi);
        else if (m.check) ok = !!m.check(lab.state, lab);
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
    lab.mountQuiz();
    panel.append(h('button', { class: 'reset-btn', onclick: () => lab.reset() }, '설정을 기본값으로'));
    const first = lab.done.findIndex(d => !d);
    select(first >= 0 ? first : 0);
    fit();
    syncMode();
    if (['model', 'learn'].includes(chosenMode)) store.set('cs-mode-v1', chosenMode);
    else {
      const chooser = h('dialog', { class: 'teach mode-chooser', 'aria-label': '모드 고르기' });
      chooser.append(h('div', { class: 'teach-in' }, h('h2', null, '어떻게 살펴볼까요?'),
        h('p', null, '두 모드는 같은 실험과 같은 계산을 사용합니다.'),
        h('div', { class: 'mode-cards' },
          h('button', { onclick: () => { lab.setMode('model'); chooser.close(); } }, h('strong', null, '모형 모드'), h('span', null, '직접 바꾸며 힘과 움직임을 살펴봅니다.')),
          h('button', { onclick: () => { lab.setMode('learn'); chooser.close(); } }, h('strong', null, '학습 모드'), h('span', null, '미션을 해결하고, 여러 번 재서 기록하고, 생각을 확인합니다.')))));
      chooser.addEventListener('cancel', e => e.preventDefault());
      chooser.addEventListener('close', () => chooser.remove());
      document.body.append(chooser); chooser.showModal();
    }

    let last = performance.now();
    function frame(now) {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (lab.mode === 'learn' && now - (lab.lastReading || 0) >= 250) { lab.lastReading = now; bound.forEach(f => f()); }
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

  // 학습 자료는 물리 상태와 별도로 보관한다. 표시 오차가 운동이나 판정에 들어가지 않는다.
  function installLearning(lab, { h, store, KEY, panel, parent }) {
    const readings = new Map();
    lab.measure = (id, value, o = {}) => {
      if (lab.mode !== 'learn' || (o.zero !== false && value === 0)) return value;
      const tick = Math.floor(performance.now() / 250);
      let r = readings.get(id);
      if (o.fresh || !r || r.tick !== tick || r.value !== value) {
        r = { tick, value, measured: value + (Math.random() * 2 - 1) * (o.amplitude || 0) };
        readings.set(id, r);
      }
      return r.measured;
    };
    function table(columns, rows, caption) {
      return h('div', { class: 'table-scroll', tabindex: '0', 'aria-label': caption },
        h('table', { class: 'record-table' }, h('caption', null, caption),
          h('thead', null, h('tr', null, columns.map(c => h('th', { scope: 'col' }, c.label)))),
          h('tbody', null, rows.map(r => h('tr', null, columns.map(c => h('td', null,
            c.format ? c.format(r[c.key]) : c.numeric ? Number(r[c.key]).toFixed(c.digits == null ? 2 : c.digits) : String(r[c.key] == null ? '' : r[c.key]))))))));
    }
    lab.ui.records = o => {
      const key = `${KEY}-records-${o.id}-v${o.version || 1}`;
      const valid = r => r && o.columns.every(c => c.numeric ? typeof r[c.key] === 'number' && Number.isFinite(r[c.key]) : typeof r[c.key] === 'string') && (!o.validate || o.validate(r));
      const saved = store.get(key);
      const rows = Array.isArray(saved) ? saved.filter(valid).slice(0, 500) : [];
      if (o.legacy && !store.get(key+'-migrated')) {
        const legacy = store.get(o.legacy.key);
        if (!saved && Array.isArray(legacy)) {
          legacy.map(o.legacy.convert).filter(valid).forEach(r=>rows.push({...r,_mission:-1,_design:null}));
          store.set(key,rows);
        }
        store.set(key+'-migrated',true);
      }
      const summary = () => {
        const groups = new Map();
        rows.forEach(r => { const k = JSON.stringify(o.conditions.map(c => r[c])); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(r); });
        return [...groups.values()].map(rs => ({ ...rs[0], count: rs.length, mean: rs.reduce((s, r) => s + r[o.measure], 0) / rs.length }));
      };
      const status = h('p', { class: 'record-status', role: 'status' });
      const preview = h('div');
      const chart = h('div', { class: 'record-chart', tabindex:'0', 'aria-label':'측정값 그래프. 좁은 화면에서는 좌우로 이동할 수 있습니다.' });
      const allTables = h('div');
      const xSel = h('select', { 'aria-label': '그래프 가로축' }, o.columns.map(c => h('option', { value: c.key }, c.label)));
      const ySel = h('select', { 'aria-label': '그래프 세로축' }, o.columns.filter(c => c.numeric).map(c => h('option', { value: c.key }, c.label)));
      xSel.value = o.x; ySel.value = o.y || o.measure;
      const dlg = h('dialog', { class: 'teach records-dialog', 'aria-label': '실험 기록장' },
        h('div', { class: 'teach-in' }, h('button', { class: 'teach-x', 'aria-label': '기록장 닫기', onclick: () => dlg.close() }, '×'),
          h('h2', null, '실험 기록장'), h('p', null, '같은 조건에서 여러 번 재면 평균을 비교할 수 있습니다. 평균에도 오차가 남을 수 있습니다.'),
          h('div', { class: 'record-axes' }, h('label', null, '가로축 ', xSel), h('label', null, '세로축 ', ySel)), chart,
          h('p', { class: 'pnote' }, '점 하나는 측정 한 번입니다. 선으로 잇지 않습니다. 좁은 화면에서는 그래프를 좌우로 밀거나 방향키로 이동하세요. 조건이 다른 점은 아래 표에서 구별하세요.'), allTables));
      document.body.append(dlg);
      const book = {
        rows, key, summary,
        add(row) {
          if (lab.mode !== 'learn') return false;
          if (rows.length >= 500) { status.textContent = '500회까지 보관할 수 있습니다. CSV로 저장한 뒤 미션 다시 하기로 비워 주세요.'; return false; }
          if (!valid(row)) throw new Error('기록의 열과 값 형식을 확인하세요: ' + o.id);
          const design = lab.designs[lab.mi];
          rows.push({ ...row, _mission: lab.mi, _design: design ? design.token : null });
          store.set(key, rows); render(); return true;
        },
        clear() { rows.length = 0; store.del(key); if(o.legacy)store.del(o.legacy.key); render(); },
        exportCSV() {
          const quote = v => '"' + (typeof v === 'number' ? String(v) : String(v).replace(/^[=+@-]/, "'" + String(v)[0])).replace(/"/g, '""') + '"';
          return '\uFEFF' + [o.columns.map(c => quote(c.label)).join(','), ...rows.map(r => o.columns.map(c => quote(c.format ? c.format(r[c.key]) : r[c.key])).join(','))].join('\r\n');
        },
      };
      const csvBtn = h('button', { class: 'abtn', onclick: () => {
        const url = URL.createObjectURL(new Blob([book.exportCSV()], { type: 'text/csv;charset=utf-8' }));
        const a = h('a', { href: url, download: `${lab.cfg.id}-records.csv` }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      } }, 'CSV 내보내기');
      const el = h('div', { class: 'records learn-only' }, status, preview,
        h('button', { class: 'abtn', onclick: () => { renderChart(); dlg.showModal(); } }, '표·평균·그래프 열기'), csvBtn);
      parent().append(el);
      function renderChart() {
        const x = o.columns.find(c => c.key === xSel.value), y = o.columns.find(c => c.key === ySel.value);
        const ns = 'http://www.w3.org/2000/svg';
        const svg = document.createElementNS(ns, 'svg');
        svg.setAttribute('viewBox', '0 0 640 320'); svg.setAttribute('width', '640'); svg.setAttribute('height', '320');
        svg.setAttribute('role', 'img'); svg.setAttribute('aria-label', `${x.label}에 따른 ${y.label}. 수치는 아래 그래프 데이터 표에서 읽을 수 있습니다.`);
        const node = (tag, attrs, text) => { const n = document.createElementNS(ns, tag); Object.entries(attrs).forEach(([k,v]) => n.setAttribute(k,v)); if(text != null)n.textContent=text; svg.append(n); return n; };
        const cats = [...new Set(rows.map(r => r[x.key]))];
        const xValues = rows.map(r => x.numeric ? r[x.key] : cats.indexOf(r[x.key]));
        let xmin = Math.min(0, ...xValues), xmax = Math.max(1, ...xValues);
        const ymin = Math.min(0, ...rows.map(r => r[y.key])), ymax = Math.max(1, ...rows.map(r => r[y.key])) * 1.08;
        if (!x.numeric) { xmin = -0.5; xmax = Math.max(0.5, cats.length - 0.5); }
        const px = v => 70 + (v - xmin) / (xmax - xmin) * 530, py = v => 258 - (v - ymin) / (ymax - ymin) * 220;
        node('path', { d: 'M70 28V258H605', fill: 'none', stroke: '#475569', 'stroke-width': 2 });
        for(let i=0;i<=4;i++) {
          const v = ymin+(ymax-ymin)*i/4;
          node('line',{x1:70,y1:py(v),x2:605,y2:py(v),stroke:'#e3e7ee'});
          node('text',{x:63,y:py(v)+4,'text-anchor':'end','font-size':13},v.toFixed(1));
        }
        const ticks = x.numeric ? Array.from({length:5},(_,i)=>xmin+(xmax-xmin)*i/4) : cats.map((_,i)=>i);
        ticks.forEach(v => node('text',{x:px(v),y:279,'text-anchor':'middle','font-size':13},x.numeric ? v.toFixed(1) : (x.format ? x.format(cats[v]) : cats[v])));
        node('text',{x:335,y:310,'text-anchor':'middle','font-size':14},x.label);
        node('text',{x:70,y:18,'font-size':14},y.label);
        rows.forEach((r,i) => node('circle',{cx:px(xValues[i]),cy:py(r[y.key]),r:4.5,fill:'#2563eb',opacity:0.65}));
        chart.replaceChildren(svg);
      }
      function render() {
        status.textContent = rows.length ? `${rows.length}회 기록했습니다. 같은 조건의 평균은 기록장에서 확인하세요.` : '아직 기록이 없습니다. 실험해서 측정값을 남겨 보세요.';
        preview.replaceChildren(rows.length ? table(o.columns, rows.slice(-3), '최근 측정 기록') : h('p', { class: 'pnote' }, '미션의 다시 하기를 누르면 기록도 함께 지워집니다.'));
        const meanColumns = [...o.columns.filter(c => o.conditions.includes(c.key)), {key:'count',label:'횟수',numeric:true,digits:0}, {key:'mean',label:`${o.columns.find(c => c.key === o.measure).label} 평균`,numeric:true,digits:2}];
        allTables.replaceChildren(table(o.columns, rows, '그래프 데이터 표 · 전체 측정 기록'), table(meanColumns, summary(), '같은 조건의 측정 횟수와 평균'));
        csvBtn.disabled = !rows.length;
        renderChart();
      }
      xSel.addEventListener('change', renderChart); ySel.addEventListener('change', renderChart);
      lab.recordBooks[o.id] = book; render(); return book;
    };
    lab.ui.graphData = o => {
      const content=h('div');
      const update=()=>content.replaceChildren(table(o.columns,o.getRows(),'시간 그래프 데이터 표 · 새로 고침 시점의 모형값'));
      const details=h('details',{class:'graph-table learn-only'},h('summary',null,'시간 그래프 데이터 표'),
        h('button',{class:'abtn',onclick:update},'현재 그래프 데이터로 새로 고침'),content);
      details.addEventListener('toggle',()=>{if(details.open)update();});parent().append(details);return details;
    };
    lab.renderVariables = (m, i) => {
      const v = m.variables;
      const select = label => h('select', { 'aria-label': label }, h('option', { value: '' }, '고르세요'), v.options.map(([key,text]) => h('option', {value:key},text)));
      const change = select('바꿀 것'), measure = select('잴 것');
      const keep = v.options.map(([key,text]) => h('label', null, h('input',{type:'checkbox',value:key}), ' ', text));
      const status = h('p', { class: 'design-status', role: 'status' }, '설계를 고른 뒤 실험을 시작하세요.');
      const form = h('div', { class: 'variable-design' }, h('label',null,'바꿀 것 ',change),
        h('fieldset',null,h('legend',null,'그대로 둘 것'),keep),h('label',null,'잴 것 ',measure),
        h('button',{class:'abtn',onclick:() => {
          if (lab.mi !== i || lab.mode !== 'learn') return;
          const keys=keep.filter(l=>l.querySelector('input').checked).map(l=>l.querySelector('input').value).sort();
          if(change.value !== v.change || measure.value !== v.measure || JSON.stringify(keys)!==JSON.stringify([...v.keep].sort())) {
            delete lab.designs[i]; status.textContent='한 가지 조건만 바꾸고, 비교할 다른 조건은 같게 두세요. 측정값을 바꿀 조건으로 고르지는 않았는지 살펴보세요.'; return;
          }
          lab.designs[i]={token:Date.now()+'-'+Math.random(),status};
          status.textContent='설계를 저장했습니다. 지금부터 서로 다른 조건으로 두 번 이상 실험하고 기록하세요.';
        }},'이 설계로 실험하기'),status);
      form.addEventListener('change',()=>{delete lab.designs[i];status.textContent='설계가 바뀌었습니다. 다시 저장한 뒤 새 실험 기록을 모으세요.';});
      return form;
    };
    lab.checkVariables = (m, i) => {
      const v=m.variables, design=lab.designs[i], book=lab.recordBooks[v.recordId];
      if(!design || !book)return false;
      const rs=book.rows.filter(r=>r._mission===i && r._design===design.token);
      if(rs.length<(v.minRows||2))return false;
      if(!v.keep.every(k=>rs.every(r=>r[k]===rs[0][k]))) {
        design.status.textContent='그대로 둘 조건도 달라졌습니다. 설계를 다시 저장하고, 통제할 조건을 같게 맞춰 새로 재 보세요.'; return false;
      }
      if(new Set(rs.map(r=>r[v.change])).size<2) {
        design.status.textContent='같은 조건을 반복해 쟀습니다. 이제 바꾸기로 한 조건을 달리하여 기록하세요.'; return false;
      }
      return true;
    };
    const quizKey=KEY+'-quiz-v1';
    let quizEl;
    const quizStored=store.get(quizKey);
    let picks=Array.isArray(quizStored)?quizStored:[];
    function renderQuiz() {
      if(!quizEl)return;
      quizEl.replaceChildren(h('h3',null,'확인 문제'));
      (lab.cfg.quiz||[]).forEach((q,i)=>{
        const result=h('p',{class:'quiz-feedback',role:'status'});
        const options=h('div',{class:'quiz-options'});
        const explain=()=>{const pick=picks[i];if(!Number.isInteger(pick)||!q.options[pick])return; result.textContent=(pick===q.answer?'맞았습니다. ':'다시 생각해 보세요. ')+q.feedback[pick]; [...options.children].forEach((b,k)=>b.setAttribute('aria-pressed',String(k===pick)));};
        q.options.forEach((text,k)=>options.append(h('button',{'aria-pressed':'false',onclick:()=>{picks[i]=k;store.set(quizKey,picks);explain();}},text)));
        quizEl.append(h('section',{class:'quiz-question'},h('h4',null,`${i+1}. ${q.kind} · ${q.question}`),options,result));explain();
      });
    }
    lab.mountQuiz=()=>{if(!lab.cfg.quiz)return;quizEl=h('div',{class:'grp quiz learn-only'});panel.append(quizEl);renderQuiz();};
    lab.resetQuiz=()=>{picks=[];store.del(quizKey);renderQuiz();};
  }

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
      ctx.fillStyle = '#6b7280'; ctx.font = `600 ${g.fontSize || 13}px Pretendard, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      for (let i = 0; i <= nx; i++) ctx.fillText(fmtNum(g.xMax * i / nx, g.xDigits || 0), x + w * i / nx, y + h + 5);
      ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
      for (let i = 0; i <= ny; i++) ctx.fillText(fmtNum(g.yMax * i / ny, g.yDigits || 0), x - 6, y + h - h * i / ny);
      ctx.fillStyle = '#374151'; ctx.font = `700 ${g.fontSize || 14}px Pretendard, sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(g.xLabel || '', x + w / 2, y + h + 24);
      ctx.save(); ctx.translate(x - (g.yLabelOffset || 44), y + h / 2); ctx.rotate(-Math.PI / 2); ctx.textBaseline = 'middle'; ctx.fillText(g.yLabel || '', 0, 0); ctx.restore();
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
