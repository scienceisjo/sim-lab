/* End-to-end checks: independent reference values, real keyboard/pointer actions,
 * mission isolation, data persistence, both modes, four viewport sizes. */
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const defs=require('./fixtures/curriculum.json');
const out=process.env.TEST_OUTPUT||path.resolve('test-results/curriculum');fs.mkdirSync(out,{recursive:true});
const report={labs:[],errors:[],started:new Date().toISOString()};let browser;
const selected=process.env.LAB_FILTER?defs.filter(d=>d.id.includes(process.env.LAB_FILTER)):defs;
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 browser=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const p=await browser.newPage();await p.setViewport({width:1920,height:1080});
 p.on('pageerror',e=>report.errors.push({url:p.url(),error:e.message}));
 p.on('console',m=>{if(m.type()==='error')report.errors.push({url:p.url(),error:m.text()});});
 const click=async(sel,text)=>{const h=await p.evaluateHandle((s,t)=>[...document.querySelectorAll(s)].find(e=>e.textContent.trim()===t&&e.getClientRects().length),sel,text);assert.ok(h.asElement(),'Cannot find '+text);await h.asElement().click();await h.dispose();};
 async function choose(d,key,value){
  const o=d.controls.find(x=>x.key===key);
  if(o.options){await click(`.seg[aria-label="${o.label}"] button`,o.options.find(x=>x[0]===value)[1]);}
  else {
   const el=await p.$(`input[aria-label="${o.label}"]`);await el.evaluate(e=>e.scrollIntoView({block:'center'}));await el.focus();
   if(value===o.min)await p.keyboard.press('Home');else if(value===o.max)await p.keyboard.press('End');
   else{const r=await el.boundingBox();await p.mouse.click(r.x+8+(r.width-16)*(value-o.min)/(o.max-o.min),r.y+r.height/2);let now=await p.evaluate(k=>lab.state[k],key);let n=Math.round((value-now)/o.step);assert.ok(Math.abs(n)<15,`${d.id} drag correction ${n}`);while(n){await p.keyboard.press(n>0?'ArrowRight':'ArrowLeft');n+=n>0?-1:1;}}
  }
  assert.equal(await p.evaluate(k=>lab.state[k],key),value,`${d.id} ${key}`);
 }
 const record=()=>click('.abtn','현재 관찰 기록');
 async function card(i){await p.click(`.mcard:nth-child(${i+1}) .t`);}
 async function done(i,expected=true){assert.equal(await p.evaluate(i=>!!lab.done[i],i),expected,'Mission '+i);}
 for(const d of selected){
  const r={id:d.id,numeric:[],missions:[],screens:[]};report.labs.push(r);
  try{
   await p.setViewport({width:1920,height:1080});await p.goto(`http://127.0.0.1:7101/labs/${d.id}/?mode=learn`);await p.evaluate(()=>localStorage.clear());await p.reload();await p.waitForFunction(()=>window.lab?.science);
   // Independently specified hand reference cases run in both modes.
   for(const mode of ['learn','model']){
    await p.click(`[data-mode=${mode}]`);
    for(const fixture of d.checks){const actual=await p.evaluate(s=>lab.science.evaluate(s),fixture.state);for(const [k,v]of Object.entries(fixture.expected)){if(typeof v==='number')assert.ok(Math.abs(actual[k]-v)<1e-7,`${d.id} ${mode} ${k}: ${actual[k]} != ${v}`);else assert.equal(actual[k],v);}r.numeric.push({mode,...fixture,actual});}
   }
   // Boundary combinations: no NaN/Infinity/undefined, correct numerical types.
   r.boundaryCases=await p.evaluate(()=>{const d=lab.science.definition;let ss=[{}];for(const c of d.controls){const vs=c.options?c.options.map(x=>x[0]):[c.min,c.max];ss=ss.flatMap(s=>vs.map(v=>({...s,[c.key]:v})));}for(const s of ss){const v=d.evaluate(s);for(const o of d.outputs)if(o.numeric===false?typeof v[o.key]!=='string':!Number.isFinite(v[o.key]))throw Error(JSON.stringify(s)+' invalid '+o.key);}return ss.length;});
   await p.click('[data-mode=learn]');
   const first=d.controls[0],a=first.options?first.options[0][0]:first.min,b=first.options?first.options.at(-1)[0]:first.max;
   await card(0);await choose(d,first.key,a);await record();await record();await done(0,false);await choose(d,first.key,b);await record();await done(0);r.missions.push('Compare two genuinely different conditions');
   let targetIndex=1;
   if(!d.observation){
    await card(1);
    await p.select('.mcard.on select[aria-label="바꿀 것"]',first.key);
    const measure=await p.evaluate(()=>lab.science.definition.measure||lab.science.definition.outputs[0].key);
    await p.select('.mcard.on select[aria-label="잴 것"]',measure);
    for(const o of d.controls.slice(1))await p.click(`.mcard.on input[value="${o.key}"]`);
    await click('.mcard.on .abtn','이 설계로 실험하기');await choose(d,first.key,a);await record();await record();await done(1,false);
    await choose(d,first.key,b);await record();await done(1);r.missions.push('Designed experiment with control variables');targetIndex=2;
   }
   await card(targetIndex);await done(targetIndex,false);
   for(const [key,value]of Object.entries(d.target))await choose(d,key,value);
   // Hidden overlay must not count as model observation evidence.
   await p.click('[data-view=scene]');await record();await done(targetIndex,false);await p.click('[data-view=model]');
   const repeat=await p.evaluate(()=>!!lab.science.definition.repeat);
   await record();if(repeat){await done(targetIndex,false);await record();await done(targetIndex,false);await record();}await done(targetIndex);r.missions.push('Challenge uses fresh, visible evidence'+(repeat?' with three repeated readings':''));
   await card(targetIndex+1);const blanks=await p.$$('.mcard.on .blank');assert.equal(blanks.length,d.answers.length);for(let i=0;i<blanks.length;i++){await(await blanks[i].$$('button'))[d.answers[i]].click();if(i<blanks.length-1)await done(targetIndex+1,false);}await done(targetIndex+1);r.missions.push('Conclusion completes only after every blank');
   for(const [i,answer]of d.quiz.entries()){const sel=`.quiz-question:nth-of-type(${i+1})`;const wrong=(answer+1)%3;await p.click(`${sel} .quiz-options button:nth-child(${wrong+1})`);assert.ok(!(await p.$eval(`${sel} .quiz-feedback`,e=>e.textContent)).includes('맞았습니다'));await p.click(`${sel} .quiz-options button:nth-child(${answer+1})`);assert.match(await p.$eval(`${sel} .quiz-feedback`,e=>e.textContent),/맞았습니다/);}
   r.quiz='Wrong answers explain why; all correct choices pass';
   // Frozen comparison must stay fixed as the current controls change.
   await click('.abtn','현재 조건을 비교판에 고정');const pinned=await p.evaluate(()=>lab.science.getPinned());await choose(d,first.key,a===d.target[first.key]?b:a);assert.deepEqual(await p.evaluate(()=>lab.science.getPinned()),pinned);
   // Accessible observation table / numerical graph and CSV are both exercised.
   await click('.abtn',d.observation?'관찰 표 열기':'표·평균·그래프 열기');assert.ok(await p.$eval('.records-dialog',e=>e.open));assert.ok(await p.$$eval('.records-dialog tbody tr',es=>es.length>0));await p.click('.records-dialog .teach-x');
   const n=await p.evaluate(()=>lab.recordBooks.evidence.rows.length),csv=await p.evaluate(()=>lab.recordBooks.evidence.exportCSV());assert.ok(csv.includes('\r\n'));await p.reload();assert.equal(await p.evaluate(()=>lab.recordBooks.evidence.rows.length),n);
   await p.click('[data-mode=model]');await p.evaluate(()=>lab.science.record());assert.equal(await p.evaluate(()=>lab.recordBooks.evidence.rows.length),n);assert.ok(await p.$eval('.records',e=>!e.getClientRects().length));
   await p.focus('[data-view=scene]');await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>lab.modelVisible),false);await p.focus('[data-view=model]');await p.keyboard.press('Space');assert.equal(await p.evaluate(()=>lab.modelVisible),true);
   if(await p.evaluate(()=>!!lab.cfg.step)){await p.evaluate(()=>{lab.sceneTime=0;lab._acc=0;for(let i=0;i<60;i++)lab.cfg.step(1/60,lab);});assert.ok(Math.abs(await p.evaluate(()=>lab.sceneTime)-1)<1e-10);r.time='Fixed 1/120 s accumulation matches one second';}
   await p.click('[data-mode=learn]');p.once('dialog',dlg=>dlg.accept());await click('.m-head button','다시 하기');assert.equal(await p.evaluate(()=>lab.recordBooks.evidence.rows.length),0);assert.ok(await p.evaluate(()=>!lab.done.some(Boolean)));
   if(process.env.SKIP_SCREENS!=='1')for(const [width,height]of [[1920,1080],[1366,768],[1024,768],[390,844]])for(const mode of ['model','learn']){
    await p.setViewport({width,height});await p.goto(`http://127.0.0.1:7101/labs/${d.id}/?mode=${mode}`);await p.evaluate(s=>{Object.assign(lab.state,s);lab.update();},d.target);await sleep(100);
    assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${d.id} horizontal overflow ${width}`);
    const name=`${d.id}-${mode}-${width}x${height}.png`;await p.screenshot({path:path.join(out,name)});r.screens.push(name);
   }
   r.passed=true;console.log('PASS '+d.id);
  }catch(e){r.failure=e.stack;console.error('FAIL '+d.id+': '+e.message);}
  fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2));
 }
 assert.deepEqual(report.errors,[]);assert.ok(report.labs.every(l=>l.passed),report.labs.filter(l=>!l.passed).map(l=>l.id).join(', '));
 console.log(`PASS ${report.labs.length} curriculum labs`);
})().catch(e=>{report.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{report.finished=new Date().toISOString();fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(report,null,2));if(browser)await browser.close();});
