/* Curriculum explorers: science lives in each page's evaluate/draw functions.
 * This adapter supplies evidence, accessible controls, records and comparison.
 * It never changes a scientific value or adds noise to a drawing.
 */
(function(){
'use strict';
const C={ink:'#16324b',blue:'#2563eb',red:'#dc4c46',green:'#16866e',gold:'#d99112',purple:'#7955bb',muted:'#64748b'};
function painter(c,l){
 const p={c,C};
 p.text=(x,y,s,size=20,color=C.ink,align='center')=>{
  size=l.fs(size);c.fillStyle=color;c.font=`600 ${size}px system-ui, "Malgun Gothic", sans-serif`;c.textAlign=align;c.textBaseline='middle';
  const max=align==='center'?Math.max(120,Math.min(870,2*Math.min(x-20,940-x))):align==='left'?940-x:x-20;
  const lines=[];let line='';for(const ch of String(s)){if(line&&c.measureText(line+ch).width>max){lines.push(line);line=ch;}else line+=ch;}if(line)lines.push(line);
  const top=y-(lines.length-1)*size*.56;lines.forEach((t,i)=>c.fillText(t,x,top+i*size*1.12));
 };
 p.line=(x,y,X,Y,color=C.muted,width=3,dash=[])=>{c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.beginPath();c.moveTo(x,y);c.lineTo(X,Y);c.stroke();c.setLineDash([]);};
 p.arrow=(x,y,X,Y,color=C.blue,width=4)=>{p.line(x,y,X,Y,color,width);const a=Math.atan2(Y-y,X-x);c.fillStyle=color;c.beginPath();c.moveTo(X,Y);c.lineTo(X-12*Math.cos(a-.45),Y-12*Math.sin(a-.45));c.lineTo(X-12*Math.cos(a+.45),Y-12*Math.sin(a+.45));c.fill();};
 p.circle=(x,y,r,color,stroke)=>{c.beginPath();c.arc(x,y,Math.max(0,r),0,Math.PI*2);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}};
 p.box=(x,y,w,h,color='#eef4fa',stroke)=>{c.fillStyle=color;c.beginPath();c.roundRect(x,y,w,h,12);c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=2;c.stroke();}};
 p.ellipse=(x,y,rx,ry,color,stroke)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,2*Math.PI);c.fillStyle=color;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=3;c.stroke();}};
 p.path=(points,color=C.blue,width=3,dash=[])=>{if(!points.length)return;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.setLineDash(dash);c.stroke();c.setLineDash([]);};
 p.flow=(labels,active=-1)=>{const width=780/labels.length;labels.forEach((s,i)=>{const x=90+i*width;p.box(x,225,width-22,100,i===active?'#d9ecff':'#eff4f8');p.text(x+(width-22)/2,275,s,Math.min(22,110/Math.max(s.length,1)*3));if(i<labels.length-1)p.arrow(x+width-20,275,x+width-2,275,C.green,3);});};
 p.bar=(x,y,label,value,max,color=C.blue,unit='')=>{p.text(x,y-24,label,20,C.ink,'left');p.box(x,y,300,18,'#e2e8f0');p.box(x,y,Math.max(0,300*Math.min(value/max,1)),18,color);p.text(x+310,y+9,typeof value==='number'?value.toFixed(1)+unit:value,18,C.ink,'left');};
 p.graph=(points,{x=120,y=155,w=700,h=270,xmax=10,ymax=10,xlabel='',ylabel='',color=C.blue}={})=>{p.line(x,y,x,y+h);p.line(x,y+h,x+w,y+h);for(let i=0;i<=4;i++){p.text(x-12,y+h-h*i/4,(ymax*i/4).toFixed(1),16,C.muted,'right');p.text(x+w*i/4,y+h+24,(xmax*i/4).toFixed(1),16,C.muted);}p.text(x+w/2,y+h+57,xlabel,20);p.text(x,y-30,ylabel,20,C.ink,'left');p.path(points.map(([a,b])=>[x+a/xmax*w,y+h-b/ymax*h]),color);};
 return p;
}
function start(d){
 let book,lab,pinned=null,note,comparisonNote;const keys=d.controls.map(x=>x.key),measure=d.outputs.find(x=>x.key===d.measure)||d.outputs[0];
 const observation=!!d.observation;
 const conditionColumns=d.controls.map(o=>({key:o.key,label:o.label+(o.unit?' ('+o.unit+')':''),numeric:!o.options,digits:o.digits??1,format:o.options?v=>o.options.find(x=>String(x[0])===String(v))?.[1]||v:undefined}));
 const columns=[...conditionColumns,...d.outputs.map(o=>({...o,numeric:o.numeric!==false,digits:o.digits??2}))];
 const validState=s=>d.controls.every(o=>o.options?o.options.some(([v])=>String(v)===String(s[o.key])):Number.isFinite(s[o.key])&&s[o.key]>=o.min-1e-8&&s[o.key]<=o.max+1e-8);
 const rowState=r=>Object.fromEntries(d.controls.map(o=>[o.key,o.options?o.options.find(x=>String(x[0])===String(r[o.key]))?.[0]:r[o.key]]));
 const validRow=r=>{const s=rowState(r);if(!validState(s))return false;const v=d.evaluate(s);return d.outputs.every(o=>o.numeric===false?r[o.key]===v[o.key]:Math.abs(r[o.key]-v[o.key])<=(o.noise||0)+1e-7);};
 const rows=i=>book.rows.filter(r=>r._mission===i&&r._visible===true);
 const clearComparison=()=>{pinned=null;if(comparisonNote)comparisonNote.textContent='고정한 조건과 지금 조건의 결과를 나란히 비교합니다.';};
 const varied=(rs,k)=>new Set(rs.map(r=>r[k])).size>=2;
 const record=l=>{
  if(l.mode!=='learn')return;
  const v=d.evaluate(l.state),r={};
  d.controls.forEach(o=>r[o.key]=o.options?String(l.state[o.key]):l.state[o.key]);
  d.outputs.forEach(o=>r[o.key]=o.numeric===false?v[o.key]:l.measure(o.key,v[o.key],{amplitude:o.noise||0,fresh:true}));
  r._visible=l.modelVisible;
  book.add(r);note.textContent=l.modelVisible?'관찰을 기록했습니다. 조건을 바꾸어 비교하세요.':'장면을 기록했습니다. 미션에서는 모형 설명도 켜고 관찰하세요.';l.update();
 };
 const missions=[{kind:'둘러보기',title:d.exploreTitle||'조건을 바꾸어 비교하기',text:d.explore||`${d.controls[0].label} 조건을 두 가지 이상 골라 모형을 살펴보고 각각 기록하세요.`,check:()=>varied(rows(0),keys[0])}];
 if(!observation&&keys.length>1)missions.push({kind:'변인 고르기',title:'한 가지 조건만 바꾸기',text:`${d.controls[0].label}에 따라 ${measure.label}이 어떻게 달라지는지 조사하세요. 설계를 저장하고 서로 다른 조건에서 기록하세요.`,variables:{options:[...d.controls.map(o=>[o.key,o.label]),[measure.key,measure.label]],change:keys[0],keep:keys.slice(1),measure:measure.key,recordId:'evidence'}});
 const targetIndex=missions.length;
 missions.push({kind:'해 보기',title:d.challenge.title,text:d.challenge.text,check:()=>{const rs=rows(targetIndex).filter(r=>d.challenge.check(rowState(r),d.evaluate(rowState(r))));return rs.length>=(d.repeat?3:1);}});
 missions.push({kind:'찾아내기',title:'관찰을 설명하기',text:d.conclusionPrompt||'비교한 결과로 문장을 완성하세요.',sentence:d.conclusion,blanks:d.answers});
 lab=Lab.init({id:d.id,version:1,title:d.title,subject:d.subject,unit:d.unit,grade:'중학교',updated:'2026-09-27',board:{w:960,h:600},state:d.state,
  viewLabels:{scene:'장면 보기',model:'모형 설명'},sceneDescription:'모형 설명을 켜면 눈에 보이지 않는 구조와 관계를 함께 살펴볼 수 있습니다.',sceneNote:d.limit,assumptions:d.assumptions,
  teacher:`<h4>교육과정</h4><p>${d.codes.join(', ')} · ${d.core}</p><h4>계산·모형 규칙</h4><p>${d.rule}</p><h4>범위와 한계</h4><p>${d.limit}</p><h4>창의 장치</h4><p>${d.creative} 비교판은 현재 조건의 모형값을 고정합니다. 실제 물체나 에너지가 복제되는 뜻이 아닙니다.</p>`,
  missions,quiz:d.quiz,
  setup(l){
   const u=l.ui;u.group('직접 바꾸어 보세요');
   d.controls.forEach(o=>u[o.options?'choice':'slider']({...o,onChange:()=>{}}));
   u.note(d.prompt);u.group('현재 관찰');
   d.outputs.forEach(o=>u.readout({label:o.label,get:s=>{const v=d.evaluate(s)[o.key];return o.numeric===false?v:l.measure(o.key,v,{amplitude:o.noise||0}).toFixed(o.digits??2)+(o.unit?' '+o.unit:'');}}));
   u.group('비교판');u.button({label:'현재 조건을 비교판에 고정',onClick:l=>{pinned={state:{...l.state},values:d.evaluate(l.state)};comparisonNote.textContent='고정한 관찰: '+d.describe(pinned.state,pinned.values);l.update();}});u.button({label:'비교판 지우기',onClick:l=>{pinned=null;comparisonNote.textContent='고정한 조건과 지금 조건의 결과를 나란히 비교합니다.';l.update();}});comparisonNote=u.note('고정한 조건과 지금 조건의 결과를 나란히 비교합니다.');
   u.learnOnly(u.group(observation?'관찰 기록':'측정과 기록'));note=u.note(observation?'구조와 경로를 관찰해 기록하세요. 범주에는 평균을 내지 않습니다.':d.repeat?'같은 조건에서 세 번 재고 평균을 비교하세요. 측정 흔들림은 모형을 바꾸지 않습니다.':'모형의 수를 세거나 계산값을 기록합니다. 개수에는 임의 오차를 더하지 않습니다.');
   u.button({label:'현재 관찰 기록',onClick:record});
   book=u.records({id:'evidence',version:1,kind:observation?'observation':'measurement',columns,conditions:keys,measure:measure.key,x:keys[0],y:measure.key,validate:validRow});
   u.group('그림을 문장으로 읽기');u.readout({label:'현재 모형 설명',get:s=>d.describe(s,d.evaluate(s))});
   const link=u.el('a',{href:'../../curriculum/','class':'abtn'},'교육과정 탐구 지도');u.group('다른 개념 탐색').append(link);
  },
  ...(d.animate?{step(dt,l){l._acc=(l._acc||0)+dt;while(l._acc>=1/120){l.sceneTime=(l.sceneTime||0)+1/120;l._acc-=1/120;}}}:{}),
  rewind(l){clearComparison();l.sceneTime=0;l._acc=0;},reset(l){clearComparison();l.sceneTime=0;l._acc=0;},onMissionsReset(){clearComparison();},
  draw(c,l){const p=painter(c,l),v=d.evaluate(l.state);p.box(0,0,960,600,'#f8fbff');p.text(480,32,d.heading||d.title,25);c.save();c.beginPath();c.rect(30,55,900,438);c.clip();d.draw(p,l.state,v,l.modelVisible,l);c.restore();
   p.box(30,495,900,88,'#eaf2fa');
   if(pinned){const short=value=>{const s=format(value,measure);return s.length>16?s.slice(0,15)+'…':s;};p.text(250,520,'고정한 관찰',17,C.muted);p.text(250,553,short(pinned.values[measure.key]),23,C.ink);p.text(710,520,'현재 관찰',17,C.muted);p.text(710,553,short(v[measure.key]),23,C.blue);}
   else {p.text(480,539,l.modelVisible?d.caption(l.state,v):'모형 설명을 누르면 관계가 드러납니다.',21);}
  }
 });
 function format(v,o){return typeof v==='number'?v.toFixed(o.digits??2)+(o.unit?' '+o.unit:''):v;}
 lab.science={evaluate:d.evaluate,definition:d,record:()=>record(lab),getPinned:()=>pinned};
 return lab;
}
window.Explorer={start,painter,C};
})();
