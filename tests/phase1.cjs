/* Run with PUPPETEER_PATH, CHROME_PATH (optional), TEST_OUTPUT, LAB_URL.
 * Uses a fresh temporary browser profile. Does not use the user's browser data.
 * Numerical probes intentionally call cfg.step directly; mission flows use mouse/keyboard.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const pp = require(process.env.PUPPETEER_PATH || 'puppeteer-core');
const base = process.env.LAB_URL || 'http://127.0.0.1:7101';
assert.match(base, /^http:\/\/127\.0\.0\.1:71\d\d$/);
const out = process.env.TEST_OUTPUT || path.resolve('test-results');
fs.mkdirSync(out, {recursive:true});
const report = {checks:[], numerical:[], errors:[], screenshots:[]};
const sleep = ms => new Promise(r=>setTimeout(r,ms));
const near = (a,b,t=1e-8) => assert.ok(Math.abs(a-b)<=t, `${a} != ${b} (±${t})`);
let b,p;
async function check(name,fn) { if(process.env.TEST_MATCH && !new RegExp(process.env.TEST_MATCH).test(name))return; await fn(); report.checks.push(name); console.log('PASS',name); }
async function open(id,mode='learn') { await p.goto(`${base}/labs/${id}/?mode=${mode}`,{waitUntil:'networkidle0'}); }
async function clean(id,mode='learn') { await open(id,mode); await p.evaluate(()=>localStorage.clear()); await open(id,mode); }
async function clickText(selector,text) {
  const el = await p.evaluateHandle((s,t)=>[...document.querySelectorAll(s)].find(e=>e.textContent.trim()===t),selector,text);
  assert.ok(el.asElement(),`${selector}: ${text}`); await el.asElement().click(); await el.dispose();
}
async function card(i,enter=false) {
  await p.click(`.mcard:nth-child(${i+1}) .t`);
  await sleep(160);
  if(enter) await p.click('.mcard.on .enter-btn');
}
async function slider(label,steps) {
  await p.focus(`input[aria-label="${label}"]`); await p.keyboard.press('Home');
  for(let i=0;i<steps;i++)await p.keyboard.press('ArrowRight');
}
async function direction(label,v) { await p.click(`[aria-label="${label}"] button[data-v="${v}"]`); }
async function play(seconds) { await p.click('.pbtn.main'); await sleep(seconds*1000); if(await p.evaluate(()=>lab.running))await p.click('.pbtn.main'); }
async function done(i) { assert.equal(await p.evaluate(i=>!!lab.done[i],i),true,`mission ${i+1}`); }
async function design(change,keep,measure) {
  await p.select('.mcard.on select[aria-label="바꿀 것"]',change);
  await p.select('.mcard.on select[aria-label="잴 것"]',measure);
  for(const v of keep)await p.click(`.mcard.on input[value="${v}"]`);
  await clickText('.mcard.on .abtn','이 설계로 실험하기');
}
async function frictionPull(steps) {
  // Real keyboard steps, leave time for each 0.5 N increment to reach the engine.
  await p.focus('input[aria-label="당기는 힘"]');
  for(let i=0;i<steps;i++){await p.keyboard.press('ArrowRight');await sleep(24);}
  await sleep(120);
}
async function quiz(answers) {
  for(let i=0;i<answers.length;i++) {
    await p.click(`.quiz-question:nth-of-type(${i+1}) .quiz-options button:nth-child(${(answers[i]+1)%4+1})`);
    assert.match(await p.$eval(`.quiz-question:nth-of-type(${i+1}) .quiz-feedback`,e=>e.textContent),/다시 생각/);
    await p.click(`.quiz-question:nth-of-type(${i+1}) .quiz-options button:nth-child(${answers[i]+1})`);
    assert.match(await p.$eval(`.quiz-question:nth-of-type(${i+1}) .quiz-feedback`,e=>e.textContent),/맞았습니다/);
  }
}
(async()=>{
 b=await pp.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 p=await b.newPage();
 p.on('pageerror',e=>report.errors.push(e.message));
 p.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await p.setViewport({width:1920,height:1080});
 await check('first visit: two cards, keyboard selection, remember, URL priority',async()=>{
   await clean('force-balance');await p.evaluate(()=>localStorage.clear());
   await p.goto(`${base}/labs/force-balance/`,{waitUntil:'networkidle0'});
   assert.equal(await p.$$eval('.mode-cards button',es=>es.length),2);
   await p.focus('.mode-cards button');await p.keyboard.press('Enter');
   assert.equal(await p.evaluate(()=>lab.mode),'model');
   await p.goto(`${base}/labs/friction/`,{waitUntil:'networkidle0'});
   assert.equal(await p.evaluate(()=>lab.mode),'model');assert.equal(await p.$('.mode-chooser'),null);
   await open('friction');assert.equal(await p.evaluate(()=>lab.mode),'learn');
 });
 await check('force: signed sum, fixed-step motion, ghosts, mode parity, limits',async()=>{
   const states=[];
   for(const mode of ['model','learn']){
     await clean('force-balance',mode);
     const values=await p.evaluate(()=>{
       const cases=[];
       for(const [f1,d1,f2,d2] of [[50,1,30,1],[50,1,30,-1],[50,-1,30,1],[40,1,40,-1],[0,1,0,-1]]) {
         Object.assign(lab.state,{f1,d1,f2,d2});lab.rewind();const F=netF(lab.state);
         for(let i=0;i<30;i++)lab.cfg.step(1/60,lab);
         cases.push({f1,d1,f2,d2,F,x:sim.x,v:sim.v,t:sim.time});
       }
       Object.assign(lab.state,{f1:50,d1:1,f2:30,d2:-1});lab.rewind();
       for(let i=0;i<61;i++)lab.cfg.step(1/60,lab);
       const ghosts=sim.ghosts.slice();
       Object.assign(lab.state,{f1:100,d1:1,f2:100,d2:1});lab.rewind();
       for(let i=0;i<600;i++)lab.cfg.step(1/60,lab);
       return {cases,ghosts,limit:{v:sim.v,t:sim.time,ended:sim.ended},done:lab.done};
     });
     for(const r of values.cases){near(r.F,r.f1*r.d1+r.f2*r.d2);near(r.x,r.F/5*.5*.5/2);near(r.v,r.F/5*.5);}
     near(values.ghosts[0],.5);near(values.ghosts[1],2);
     assert.ok(values.limit.ended && values.limit.t<1);assert.ok(!values.done.some(Boolean));
     states.push(values);report.numerical.push({lab:'force',mode,...values});
   }
   assert.deepEqual(states[0],states[1]);
 });
 await check('friction: all surfaces × loads, static balance, slip, noise, stopping, ramp',async()=>{
   await clean('friction');
   const vals=await p.evaluate(()=>{
     const rs=[];
     for(const face of ['smooth','wood','sand'])for(let n=0;n<4;n++){
       Object.assign(lab.state,{face,n,mode:'hand'});lab.rewind();lab.state.F=fs(lab.state)-.5;
       for(let i=0;i<30;i++)lab.cfg.step(1/60,lab);
       const still={v:sim.v,fr:friction(lab.state),P:pull(lab.state)};
       lab.state.F=fs(lab.state);lab.cfg.step(1/60,lab);
       rs.push({face,n,W:load(lab.state),mass:mass(lab.state),threshold:fs(lab.state),kinetic:fk(lab.state),still,moving:sim.v>0,row:{...records.at(-1)}});
     }
     Object.assign(lab.state,{face:'wood',n:0,mode:'hand'});lab.rewind();lab.state.F=5;
     for(let i=0;i<20;i++)lab.cfg.step(1/60,lab);
     lab.state.F=0;let minV=sim.v;for(let i=0;i<120;i++){lab.cfg.step(1/60,lab);minV=Math.min(minV,sim.v);}
     const stop={v:sim.v,fr:friction(lab.state),minV};
     Object.assign(lab.state,{face:'wood',n:2,mode:'ramp'});lab.rewind();
     for(let i=0;i<510;i++)lab.cfg.step(1/60,lab);
     return {rs,stop,ramp:{P:pull(lab.state),v:sim.v,slipAt:sim.slipAt,ended:sim.ended}};
   });
   const coeff={smooth:[.25,.20],wood:[.5,.4],sand:[.8,.65]};
   for(const r of vals.rs){near(r.threshold,r.W*coeff[r.face][0]);near(r.kinetic,r.W*coeff[r.face][1]);near(r.mass,r.W/9.8);near(r.still.fr,-r.still.P);near(r.still.v,0);assert.ok(r.moving);near(r.row.F,r.threshold,.080001);}
   assert.deepEqual(vals.stop,{v:0,fr:0,minV:0});near(vals.ramp.slipAt[1],15);near(vals.ramp.P,12,.002);near(vals.ramp.v,.2,.0002);
   report.numerical.push({lab:'friction',...vals});
 });
 await check('measurement layer: bounded noise, zero tare, exact model, no motion change',async()=>{
   await clean('force-balance');
   const v=await p.evaluate(()=>{
     const rand=Math.random;let i=0;Math.random=()=>[0,.25,.5,.75,1][i++%5];
     const samples=Array.from({length:5},()=>lab.measure('test',10,{amplitude:.2,fresh:true}));
     const zero=lab.measure('test',0,{amplitude:.2,fresh:true});Math.random=rand;
     lab.setMode('model');const exact=lab.measure('test',10,{amplitude:.2,fresh:true});
     lab.setMode('learn');return {samples,zero,exact};
   });
   assert.deepEqual(v.samples,[9.8,9.9,10,10.1,10.2]);near(v.samples.reduce((a,b)=>a+b)/5,10);near(v.zero,0);near(v.exact,10);
 });
 await check('force missions 1–7 via clicks, dragging, keyboard; no guessing completion',async()=>{
   await clean('force-balance');
   await slider('힘 ① 크기',5);await play(.12);await done(0);
   await card(1,true);
   const pts=await p.evaluate(()=>{const c=document.querySelector('canvas').getBoundingClientRect();const f=(x,y)=>[c.left+x/960*c.width,c.top+y/600*c.height];return {from:f(480+60+40*2.2,380),to:f(480-60-60*2.2,380)};});
   await p.mouse.move(...pts.from);await p.mouse.down();await p.mouse.move(...pts.to,{steps:15});await p.mouse.up();await done(1);
   await card(2,true);await direction('힘 ① 방향',1);await direction('힘 ② 방향',1);
   await slider('힘 ① 크기',5);await slider('힘 ② 크기',3);
   assert.equal(await p.evaluate(()=>!!lab.done[2]),false);
   await direction('힘 ② 방향',-1);await done(2);
   await card(3,true);assert.equal(await p.$eval('.pbtn.main',e=>e.disabled),true);
   await p.click('.mcard.on .pred button:nth-child(2)');assert.equal(await p.evaluate(()=>!!lab.done[3]),false);
   await play(.7);await clickText('.abtn','합력으로 바꾸기');await play(1.65);await done(3);
   await card(4,true);await slider('힘 ① 크기',4);await slider('힘 ② 크기',4);await direction('힘 ② 방향',-1);await play(1.15);await done(4);
   await card(5);const ans=[1,1,1,0];
   const boxes=await p.$$('.mcard.on .blank');
   for(let i=0;i<4;i++){const bs=await boxes[i].$$('button');await bs[ans[i]].click();if(i<3)assert.equal(await p.evaluate(()=>!!lab.done[5]),false);}
   await done(5);
   await card(6);await design('net',['f2','directions'],'f1');
   assert.equal(await p.evaluate(()=>!!lab.designs[6]),false);
   await p.select('.mcard.on select[aria-label="바꿀 것"]','f1');await p.select('.mcard.on select[aria-label="잴 것"]','net');await clickText('.mcard.on .abtn','이 설계로 실험하기');
   await clickText('.pbtn','↺ 처음부터');await clickText('.abtn','현재 조건에서 측정·기록');await clickText('.abtn','현재 조건에서 측정·기록');
   assert.equal(await p.evaluate(()=>!!lab.done[6]),false);
   await slider('힘 ① 크기',5);await clickText('.abtn','현재 조건에서 측정·기록');await done(6);
   assert.equal(await p.evaluate(()=>lab.done.filter(Boolean).length),7);
   await quiz([1,2,0]);
 });
 await check('records mean, CSV negative numbers, dialog axes/table, storage reload and reset',async()=>{
   const r=await p.evaluate(()=>{const b=lab.recordBooks.forces;return {rows:b.rows,summary:b.summary(),csv:b.exportCSV()};});
   assert.equal(r.rows.length,3);assert.equal(r.summary[0].count,2);near(r.summary[0].mean,(r.rows[0].net+r.rows[1].net)/2);
   await slider('힘 ① 크기',1);await clickText('.abtn','현재 조건에서 측정·기록');
   const csv=await p.evaluate(()=>lab.recordBooks.forces.exportCSV());assert.match(csv,/"-\d/);assert.ok(!csv.includes('"\'-'));assert.ok(csv.startsWith('\uFEFF'));
   await clickText('.abtn','표·평균·그래프 열기');await p.select('[aria-label="그래프 가로축"]','directions');await p.select('[aria-label="그래프 세로축"]','a');
   assert.equal(await p.$$eval('dialog[open] tbody tr',es=>es.length),7);
   await p.keyboard.press('Escape');assert.equal(await p.$('dialog[open]'),null);
   await p.reload({waitUntil:'networkidle0'});assert.equal(await p.evaluate(()=>lab.recordBooks.forces.rows.length),4);assert.equal(await p.evaluate(()=>lab.done.filter(Boolean).length),7);
   assert.equal(await p.$$eval('.quiz-feedback',es=>es.filter(e=>e.textContent.includes('맞았습니다')).length),3);
   await clickText('.m-head button','다시 하기');
   assert.equal(await p.evaluate(()=>lab.recordBooks.forces.rows.length),0);assert.equal(await p.evaluate(()=>lab.done.some(Boolean)),false);assert.equal(await p.$$eval('.quiz-feedback',es=>es.filter(e=>e.textContent).length),0);
   // Equivalent accessible path for the force-arrow mission.
   await card(1,true);await slider('힘 ① 크기',6);await p.focus('[aria-label="힘 ① 방향"] button');await p.keyboard.press('Enter');await done(1);
 });
 await check('friction missions 1–7 via keyboard and clicks, including repeated measurement',async()=>{
   await clean('friction');await frictionPull(5);await done(0);
   await card(1,true);await frictionPull(10);await done(1);
   await card(2,true);await frictionPull(16);await done(2);
   await card(3,true);assert.equal(await p.$eval('.pbtn.main',e=>e.disabled),true);
   await p.click('.mcard.on .pred button:nth-child(3)');await frictionPull(30);await done(3);
   await card(4);const bs=await p.$$('.mcard.on .blank');for(const [i,a]of [1,0,0].entries()){await (await bs[i].$$('button'))[a].click();if(i<2)assert.equal(await p.evaluate(()=>!!lab.done[4]),false);}await done(4);
   await card(5,true);await p.click('label.tog:nth-of-type(2) input');await play(7);await done(5);
   await card(6);await design('face',['n','method'],'F');
   await clickText('.seg button','내가 조금씩 당기기');
   await clickText('.seg button','나무 면');
   await clickText('.addrow button','추 내리기');await clickText('.addrow button','추 내리기');await frictionPull(10);
   assert.equal(await p.evaluate(()=>!!lab.done[6]),false);
   await clickText('.seg button','사포 면');await frictionPull(16);await done(6);
   await clickText('.abtn','같은 조건으로 다시 재기');await frictionPull(16);
   assert.equal(await p.evaluate(()=>lab.done.filter(Boolean).length),7);await quiz([2,0,1]);
 });
 await check('invalid variable control, re-design, old/unselected evidence and model exclusion',async()=>{
   await clean('force-balance');await card(6);await design('f1',['f2','directions'],'net');
   await clickText('.abtn','현재 조건에서 측정·기록');await slider('힘 ① 크기',5);await slider('힘 ② 크기',3);await clickText('.abtn','현재 조건에서 측정·기록');
   assert.equal(await p.evaluate(()=>!!lab.done[6]),false);assert.match(await p.$eval('.mcard.on .design-status',e=>e.textContent),/그대로 둘 조건/);
   await clickText('.mcard.on .abtn','이 설계로 실험하기');await clickText('.abtn','현재 조건에서 측정·기록');assert.equal(await p.evaluate(()=>!!lab.done[6]),false);
   await p.click('[data-mode="model"]');assert.equal(await p.evaluate(()=>lab.mi),-1);
   const count=await p.evaluate(()=>lab.recordBooks.forces.rows.length);
   assert.equal(await p.evaluate(()=>lab.recordBooks.forces.add({})),false);
   assert.equal(await p.evaluate(()=>lab.recordBooks.forces.rows.length),count);
   await p.click('[data-mode="learn"]');assert.equal(await p.evaluate(()=>!!lab.done[6]),false);assert.equal(await p.evaluate(()=>!!lab.designs[6]),false);
   await clean('friction','model');
   const v=await p.evaluate(()=>{lab.state.face='wood';lab.state.F=5;for(let i=0;i<60;i++)lab.cfg.step(1/60,lab);return {v:sim.v,rows:records.length,done:lab.done};});
   assert.ok(v.v>0);assert.equal(v.rows,0);assert.equal(v.done.some(Boolean),false);
 });
 await check('legacy records migrate safely, cannot complete missions, corrupt rows rejected',async()=>{
   await clean('friction');await p.evaluate(()=>{
     localStorage.clear();localStorage.setItem('cs-lab-friction-records-v1',JSON.stringify([{face:'wood',n:0,F:5,mi:1},{face:'bogus',n:0,F:8},null]));
   });await open('friction');
   assert.deepEqual(await p.evaluate(()=>records.map(r=>[r.method,r.mi,r.F])),[['legacy',-1,5]]);
   await card(1);assert.equal(await p.evaluate(()=>!!lab.done[1]),false);
   await clickText('.m-head button','다시 하기');await p.reload({waitUntil:'networkidle0'});assert.equal(await p.evaluate(()=>records.length),0);
   await p.evaluate(()=>localStorage.setItem(lab.recordBooks.trials.key,'{"broken":true}'));await p.reload({waitUntil:'networkidle0'});assert.equal(await p.evaluate(()=>records.length),0);
 });
 await check('friction rejects overshoot and resets force when conditions change',async()=>{
   await clean('friction');await clickText('.seg button','나무 면');await slider('당기는 힘',30);await sleep(100);
   // Keyboard events need not wait for physics here; a jump is the actual test.
   await p.evaluate(()=>{lab.rewind();lab.state.F=15;lab.cfg.step(1/60,lab);});
   assert.match(await p.evaluate(()=>sim.warn),/한꺼번에/);
   await clickText('.seg button','사포 면');assert.equal(await p.evaluate(()=>lab.state.F),0);
 });
 await check('four viewport sizes × two labs × two modes: no overflow, usable canvas',async()=>{
   for(const [w,h] of [[1920,1080],[1366,768],[1024,768],[390,844]])for(const id of ['force-balance','friction'])for(const mode of ['model','learn']) {
     await p.setViewport({width:w,height:h});await open(id,mode);await sleep(160);
     const layout=await p.evaluate(()=>({width:document.documentElement.scrollWidth,inner:innerWidth,canvas:document.querySelector('canvas').getBoundingClientRect().toJSON(),shown:[...document.querySelectorAll('.learn-only,.m-now,.lab-missions')].filter(e=>e.getBoundingClientRect().width>0 && getComputedStyle(e).display!=='none').length}));
     assert.ok(layout.width<=layout.inner,`${id} ${mode} ${w}: ${layout.width}`);assert.ok(layout.canvas.width>200 && layout.canvas.height>120);if(mode==='model')assert.equal(layout.shown,0);
     const file=`${id}-${mode}-${w}x${h}.png`;await p.screenshot({path:path.join(out,file),fullPage:w<500});report.screenshots.push(file);
   }
 });
 await check('gallery route, both mode links, real progress dots, pending labs',async()=>{
   for(const [w,h] of [[1920,1080],[1366,768],[1024,768],[390,844]]) {
     await p.setViewport({width:w,height:h});await p.goto(base,{waitUntil:'networkidle0'});
     assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
     assert.equal(await p.$$eval('#inquiryPath li',es=>es.length),6);
     assert.equal(await p.$$eval('a[href*="force-balance/?mode="]',es=>es.length),4);
     const file=`gallery-${w}x${h}.png`;await p.screenshot({path:path.join(out,file),fullPage:w<500});report.screenshots.push(file);
   }
 });
 assert.deepEqual(report.errors,[]);console.log('ALL PASS',report.checks.length);
})().catch(e=>{report.failure=e.stack;console.error(e.stack);process.exitCode=1;}).finally(async()=>{
 fs.writeFileSync(path.join(out,process.env.TEST_MATCH?'validation-filtered.json':'validation.json'),JSON.stringify(report,null,2));if(b)await b.close();
});
