const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const out=process.env.TEST_OUTPUT||path.resolve('test-results/syringe-particles');fs.mkdirSync(out,{recursive:true});const result={numbers:[],missions:[],screenshots:[],errors:[]};let browser;const near=(a,b,e=1e-8)=>assert.ok(Math.abs(a-b)<=e,`${a} != ${b}`);
(async()=>{
 browser=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const p=await browser.newPage();p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});const url='http://127.0.0.1:7101/labs/syringe-particles/';await p.setViewport({width:1920,height:1080});
 for(const mode of ['model','learn']){
  await p.goto(url+'?mode='+mode);await p.waitForFunction(()=>window.lab);
  const states=await p.evaluate(()=>['walls','volume','heat'].flatMap(scene=>(scene==='walls'?[10,20,30]:scene==='volume'?[20,25,30,35,40,50,60]:[0,10,20,30,40,60,80]).map(v=>{const s={...lab.state,scene,[scene==='walls'?'count':scene==='volume'?'volume':'temperature']:v};return {scene,input:v,...values(s)};})));
  for(const s of states){near(s.P*s.V,s.n/20*40*(s.T+273.15)/293.15);near(s.motion**2/10000,(s.T+273.15)/293.15);if(s.scene!=='walls')assert.equal(s.n,20);}
  result.numbers.push({mode,states});
 }
 assert.deepEqual(result.numbers[0].states,result.numbers[1].states);
 result.engine=await p.evaluate(()=>['walls','volume','heat'].flatMap(scene=>(scene==='walls'?[10,20,30]:scene==='volume'?[20,40,60]:[0,20,80]).map(v=>{
  const s={...lab.state,scene,[scene==='walls'?'count':scene==='volume'?'volume':'temperature']:v},e=makeGas(s),initial=rms(e),energy=()=>e.ps.reduce((sum,p)=>sum+p.vx*p.vx+p.vy*p.vy,0),e0=energy();
  for(let i=0;i<7200;i++)advanceGas(e,1/60);
  return {scene,input:v,motionError:rms(e)-initial,energyError:(energy()-e0)/e0,bounds:e.ps.every(p=>p.x>=2&&p.x<=e.w-2&&p.y>=2&&p.y<=e.h-2),hits:e.hits,pressure:kineticPressure(e),ideal:e.ps.length*e0/e.ps.length/(2*e.w*e.h)};
 })));
 for(const e of result.engine){assert.ok(e.bounds);assert.ok(e.hits.every(n=>n>0));near(e.motionError,0,1e-8);near(e.energyError,0,1e-10);assert.ok(Math.abs(e.pressure/e.ideal-1)<.08,JSON.stringify(e));}
 result.partition=await p.evaluate(()=>{const a=makeGas({...lab.state,scene:'heat',temperature:80}),b=makeGas({...lab.state,scene:'heat',temperature:80});for(let i=0;i<600;i++)advanceGas(a,1/60);for(let i=0;i<1200;i++)advanceGas(b,1/120);return {a:a.ps,b:b.ps};});assert.deepEqual(result.partition.a,result.partition.b);delete result.partition;
 await p.evaluate(()=>localStorage.clear());await p.goto(url+'?mode=learn');
 async function click(sel,t){const e=await p.evaluateHandle((s,t)=>[...document.querySelectorAll(s)].find(e=>e.textContent.trim()===t&&e.getClientRects().length),sel,t);assert.ok(e.asElement(),t);await e.asElement().click();}
 async function card(i,enter=false){await p.click(`.mcard:nth-child(${i+1}) .t`);if(enter)await p.click('.mcard.on .enter-btn');}
 async function slide(label,v,min){const el=await p.$(`input[type=range][aria-label="${label}"]`);assert.ok(el,label);await el.focus();await p.keyboard.press('Home');for(let i=min;i<v;i++)await p.keyboard.press('ArrowRight');}
 async function rec(){await click('.abtn','현재 결과 측정·기록');}
 async function done(i){await p.waitForFunction(i=>!!lab.done[i],{},i);result.missions.push(i+1);}
 async function run(){await click('.pbtn','▶ 재생');await new Promise(r=>setTimeout(r,3400));await click('.pbtn','⏸ 멈춤');}
 await rec();assert.equal(await p.evaluate(()=>books.walls.rows.length),0);
 for(const n of ['10개','30개']){await click('.seg button',n);await run();await rec();}await done(0);
 await card(1,true);await rec();assert.equal(await p.evaluate(()=>books.volume.rows.length),0);await p.click('.mcard.on .pred button:nth-child(2)');await rec();await rec();assert.equal(await p.evaluate(()=>!!lab.done[1]),false);await slide('기체의 부피',25,20);await rec();await done(1);
 await card(2,true);assert.equal(await p.evaluate(()=>!!lab.done[2]),false);await p.select('.mcard.on select[aria-label="바꿀 것"]','volume');await p.select('.mcard.on select[aria-label="잴 것"]','pressure');await p.click('.mcard.on input[value="temperature"]');await p.click('.mcard.on input[value="particles"]');await click('.mcard.on .abtn','이 설계로 실험하기');await rec();await rec();assert.equal(await p.evaluate(()=>!!lab.done[2]),false);await slide('기체의 부피',55,20);await rec();await done(2);
 await card(3,true);await rec();await rec();assert.equal(await p.evaluate(()=>!!lab.done[3]),false);await slide('기체의 온도',65,0);await rec();await done(3);
 await card(4,true);await rec();await slide('기체의 부피',23,20);await rec();assert.equal(await p.evaluate(()=>!!lab.done[4]),false);await click('.seg button','압력을 같게 두기');await slide('기체의 온도',12,0);await rec();await slide('기체의 온도',57,0);await rec();await done(4);
 await card(5);for(const b of await p.$$('.mcard.on .blank'))await(await b.$$('button'))[0].click();await done(5);
 for(const [i,a]of [0,1,2].entries()){await p.click(`.quiz-question:nth-of-type(${i+1}) .quiz-options button:nth-child(${(a+1)%3+1})`);assert.ok((await p.$eval(`.quiz-question:nth-of-type(${i+1}) .quiz-feedback`,e=>e.textContent)).length>5);await p.click(`.quiz-question:nth-of-type(${i+1}) .quiz-options button:nth-child(${a+1})`);assert.match(await p.$eval(`.quiz-question:nth-of-type(${i+1}) .quiz-feedback`,e=>e.textContent),/맞았습니다/);}
 result.edges=await p.evaluate(()=>{
  const pressure=[20,40,60].flatMap(volume=>[-.002,.002].map(e=>books.volume.add({temperature:20,volume,pressure:+(40/volume+e).toFixed(3),particles:20,motion:100})));
  const heat=[0,20,80].flatMap(temperature=>[-.1,.1].map(e=>books.heat.add({temperature,volume:+(40*(temperature+273.15)/293.15+e).toFixed(1),pressure:1,particles:20,motion:100*Math.sqrt((temperature+273.15)/293.15)})));
  return {pressure,heat,csv:books.heat.exportCSV(),summary:books.volume.summary()};
 });assert.ok(result.edges.pressure.every(Boolean)&&result.edges.heat.every(Boolean));assert.ok(result.edges.csv.includes('부피(mL)'));assert.ok(result.edges.summary.some(r=>r.count>=2));
 await click('.abtn','표·평균·그래프 열기');await p.select('dialog[open] select[aria-label="그래프 가로축"]','temperature');await p.select('dialog[open] select[aria-label="그래프 세로축"]','volume');assert.ok(await p.$('dialog[open] table'));await p.click('dialog[open] [aria-label="기록장 닫기"]');
 await p.click('.graph-table summary');await click('.graph-table button','현재 그래프 데이터로 새로 고침');assert.ok(!(await p.$eval('.graph-table',e=>e.textContent)).includes('NaN'));
 const persisted=await p.evaluate(()=>({v:books.volume.rows.length,h:books.heat.rows.length}));await p.reload();assert.deepEqual(await p.evaluate(()=>({v:books.volume.rows.length,h:books.heat.rows.length})),persisted);
 for(const [w,h]of [[1920,1080],[1366,768],[1024,768],[390,844]])for(const mode of ['model','learn'])for(const scene of ['walls','volume','heat']){
  await p.setViewport({width:w,height:h});await p.goto(url+'?mode='+mode);await p.evaluate(scene=>{configure(lab,{scene,count:30,volume:20,temperature:80,vectors:true});for(let i=0;i<240;i++)lab.cfg.step(1/60,lab);lab.update();},scene);await new Promise(r=>setTimeout(r,150));assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const name=`syringe-particles-${mode}-${scene}-${w}x${h}.png`;await p.screenshot({path:path.join(out,name)});result.screenshots.push(name);
 }
 for(const [w,h]of [[1920,1080],[1366,768],[1024,768],[390,844]])for(const mode of ['model','learn']){await p.setViewport({width:w,height:h});await p.goto(url+'?mode='+mode);await p.evaluate(()=>{configure(lab,{scene:'heat',temperature:40});lab.update();});await click('.pbtn','모형 켜짐 · 실제 모습 보기');assert.equal(await p.evaluate(()=>lab.modelVisible),false);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const name=`syringe-particles-${mode}-actual-${w}x${h}.png`;await p.screenshot({path:path.join(out,name)});result.screenshots.push(name);}
 await p.setViewport({width:1920,height:1080});await p.goto(url+'?mode=learn');p.once('dialog',d=>d.accept());await click('.m-head .tbtn','다시 하기');assert.equal(await p.evaluate(()=>Object.values(books).reduce((n,b)=>n+b.rows.length,0)),0);assert.equal(await p.evaluate(()=>lab.done.some(Boolean)),false);
 await p.goto(url+'?mode=model');assert.equal(await p.evaluate(()=>{record(lab);return books.volume.rows.length;}),0);
 assert.deepEqual(result.errors,[]);console.log('PASS gas: 34 states, 9 energy/collision runs, six UI missions, three quizzes, 32 screenshots');
})().catch(e=>{result.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(result,null,2));if(browser)await browser.close();});
