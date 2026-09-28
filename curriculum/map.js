'use strict';
const $=id=>document.getElementById(id),h=(tag,text,cls)=>{const n=document.createElement(tag);if(text)n.textContent=text;if(cls)n.className=cls;return n;};
const activity={
 'm13-01':'각 실험실의 변인 설계와 기록 활동으로 과학적 탐구를 연습합니다. 과학기술의 사회적 영향과 지속가능한 실천은 별도 조사·토의 활동으로 다룹니다.',
 'm13-22':'지권과 날씨 모형에서 원인을 탐색한 뒤, 지역의 실제 재난 사례와 공식 대처 자료를 조사하고 대비 방안을 토의합니다. 실제 재난을 예측하는 모형으로 사용하지 않습니다.',
 'm13-23':'관심 있는 실험실에서 쓰인 과학 개념과 관련 직업을 조사하고 자신의 학습 계획을 세웁니다. 직업을 임의 점수로 추천하거나 자동 판정하지 않습니다.'
};
function savedProgress(d){try{const x=JSON.parse(localStorage.getItem(`cs-lab-${d.id}-v${d.version}`));return Array.isArray(x)?x:[];}catch{return[];}}
Promise.all(['units.json','labs.json','existing.json'].map(x=>fetch(x).then(r=>{if(!r.ok)throw Error(x);return r.json();}))).then(([units,fresh,existing])=>{
 const labs=[...existing,...fresh];
 const initialGrade=new URLSearchParams(location.search).get('grade');if(['1','2','3'].includes(initialGrade))$('grade').value=initialGrade;
 function render(){const query=$('search').value.trim().toLocaleLowerCase(),subject=$('subject').value,grade=$('grade').value;const fragment=document.createDocumentFragment();const shownIds=new Set(),gradeSections=new Map(),navGroups=new Map();$('nav').replaceChildren();
  for(const [i,u]of units.entries()){
   const order=CurriculumOrder.units.find(v=>v.id===u.id);if(grade!=='all'&&String(order.grade)!==grade)continue;
   const all=labs.filter(d=>d.codes.some(c=>u.standards.some(s=>s.code===c))),shown=all.filter(d=>(subject==='all'||d.subject===subject)&&(!query||[u.title,d.title,d.core,...d.codes].join(' ').toLocaleLowerCase().includes(query)));
   if(!shown.length&&(query||subject!=='all'))continue;
   const section=h('section',null,'unit');section.id=u.id;const title=h('h3');title.append(h('span',String(order.sequence).padStart(2,'0')),document.createTextNode(u.title));section.append(title);
   if(activity[u.id])section.append(h('p',activity[u.id],'activity'));
   const cards=h('div',null,'cards');
   shown.forEach(d=>{shownIds.add(d.id);const card=h('article',null,'card');const body=h('div',null,'content');body.append(h('span',d.observation?'구조·경로 관찰':'조건·관계 탐구','pill'),h('h4',d.title),h('p',d.core));const actions=h('div',null,'actions');['model','learn'].forEach((mode,i)=>{const a=h('a',i?'학습':'모형');a.href=`../labs/${d.id}/?mode=${mode}`;a.setAttribute('aria-label',d.title+' '+(i?'학습':'모형')+' 모드');actions.append(a);});body.append(actions);const done=savedProgress(d),progress=h('p',null,'progress');let completed=0;for(let i=0;i<d.missions;i++){const dot=h('span',null,'dot'+(done[i]?' done':''));if(done[i])completed++;dot.setAttribute('aria-hidden','true');progress.append(dot);}progress.append(h('small',`${completed}/${d.missions} 미션`));progress.setAttribute('aria-label',`${d.missions}개 중 ${completed}개 미션 완료`);body.append(progress);card.append(body);cards.append(card);});section.append(cards);
   const details=h('details');details.append(h('summary','교육과정 연결과 별도 활동'));u.standards.forEach(s=>{const row=h('div',null,'standard');row.append(h('b',s.code),document.createTextNode(s.summary));const refs=all.filter(d=>d.codes.includes(s.code));row.append(h('em',refs.length?'연결 모형: '+refs.map(d=>d.title).join(' · ')+' — 조사·토의·실물 실험 수행 전체를 대체하지 않습니다.':'별도 조사·토의·실천 활동입니다.'));details.append(row);});section.append(details);if(!gradeSections.has(order.grade)){const group=h('section',null,'school-grade');group.dataset.grade=order.grade;group.append(h('h2','중학 '+order.grade));fragment.append(group);gradeSections.set(order.grade,group);const nav=h('div',null,'grade-nav');nav.append(h('strong','중학 '+order.grade));$('nav').append(nav);navGroups.set(order.grade,nav);}
   gradeSections.get(order.grade).append(section);const a=h('a',order.sequence+'. '+u.title);a.href='#'+u.id;navGroups.get(order.grade).append(a);
  }$('units').replaceChildren(fragment);$('count').textContent=`${shownIds.size}개 실험실`;const url=new URL(location);grade==='all'?url.searchParams.delete('grade'):url.searchParams.set('grade',grade);history.replaceState(null,'',url);
 }
 $('grade').addEventListener('change',render);$('search').addEventListener('input',render);$('subject').addEventListener('change',render);window.addEventListener('focus',render);render();
}).catch(e=>{$('error').textContent='탐구 지도를 읽지 못했습니다. 로컬 서버 주소로 열었는지 확인하세요.';console.error(e);});
