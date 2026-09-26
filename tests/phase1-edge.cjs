const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const out=process.env.TEST_OUTPUT||path.resolve('test-results');
const base=process.env.LAB_URL||'http://127.0.0.1:7101';
assert.match(base,/^http:\/\/127\.0\.0\.1:71\d\d$/);
let browser;
(async()=>{
 browser=await pp.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const p=await browser.newPage(),errors=[];p.on('pageerror',e=>errors.push(e.message));
 async function open(id,mode,w=390,h=844){await p.setViewport({width:w,height:h});await p.goto(`${base}/labs/${id}/?mode=${mode}`,{waitUntil:'networkidle0'});}
 async function shot(name){await new Promise(r=>setTimeout(r,120));await p.screenshot({path:path.join(out,name+'.png')});}
 await open('force-balance','learn');
 // Closed mobile drawer must open with keyboard and allow a mission to be selected.
 await p.focus('.m-toggle');await p.keyboard.press('Enter');assert.equal(await p.$eval('.lab',e=>e.classList.contains('m-open')),true);
 await p.focus('.mcard:nth-child(7)');await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>lab.mi),6);
 await p.click('.m-toggle');await shot('force-variable-phone');await p.keyboard.press('Escape');
 await p.focus('.assumptions');await p.keyboard.press('Enter');assert.equal(await p.$$eval('dialog[open] li',es=>es.length),5);await shot('assumptions-phone');
 await p.keyboard.press('Escape');assert.equal(await p.evaluate(()=>document.activeElement.classList.contains('assumptions')),true);
 await p.evaluate(()=>{lab.recordBooks.forces.clear();for(const f1 of [10,30,50])for(const e of [-.1,.1])lab.recordBooks.forces.add({f1,f2:20,directions:'1,-1',a:f1+e,b:20,net:f1+e-20});});
 const btn=await p.evaluateHandle(()=>[...document.querySelectorAll('.abtn')].find(e=>e.textContent==='표·평균·그래프 열기'));await btn.asElement().click();
 assert.equal(await p.$$eval('dialog[open] svg circle',es=>es.length),6);
 assert.equal(await p.$$eval('dialog[open] tbody',es=>es[0].children.length),6);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await shot('force-records-phone');
 await p.select('[aria-label="그래프 가로축"]','directions');await p.select('[aria-label="그래프 세로축"]','a');await p.keyboard.press('Escape');
 await open('force-balance','model',1366,768);
 // Greatest possible resultant must retain its exact scale and remain on the board.
 for(const d of [-1,1]){
   const x=await p.evaluate(d=>{Object.assign(lab.state,{f1:100,f2:100,d1:d,d2:d});lab.rewind();for(let i=0;i<120;i++)lab.cfg.step(1/60,lab);return {tail:boxX(),tip:boxX()+netF(lab.state)*K};},d);
   assert.ok(x.tip>=0&&x.tip<=960);await shot(`force-200N-${d===1?'right':'left'}`);
 }
 await p.click('.model-view');assert.equal(await p.evaluate(()=>lab.modelVisible),false);await shot('force-real-view');
 const samples=[];
 for(const mode of ['model','learn']){
   await open('friction',mode,1366,768);
   samples.push(await p.evaluate(()=>{Object.assign(lab.state,{face:'sand',n:3,mode:'hand'});lab.rewind();lab.state.F=31.5;lab.cfg.step(1/60,lab);const tip=bxOf()-BW/2+4+friction(lab.state)*K;lab.state.F=32;for(let i=0;i<30;i++)lab.cfg.step(1/60,lab);return {tip,x:sim.x,v:sim.v,t:sim.time};}));
 }
 assert.deepEqual(samples[0],samples[1]);assert.ok(samples[0].tip>=0);
 for(const [w,h] of [[1920,1080],[1366,768],[1024,768],[390,844]]){
   await open('friction','learn',w,h);
   await p.evaluate(()=>{Object.assign(lab.state,{face:'sand',n:3,mode:'hand',showVert:true});lab.rewind();lab.state.F=31.5;lab.cfg.step(1/60,lab);});
   await shot(`friction-high-load-${w}x${h}`);
 }
 await open('friction','learn');
 await p.evaluate(()=>{Object.assign(lab.state,{face:'wood',n:2,mode:'ramp',showNames:true});lab.rewind();for(let i=0;i<510;i++)lab.cfg.step(1/60,lab);});
 await shot('friction-ramp-phone');
 await p.click('.graph-table summary');
 await p.waitForFunction(()=>document.querySelectorAll('.graph-table tbody tr').length>0);
 assert.equal(await p.$$eval('.graph-table tbody tr',es=>es.length),await p.evaluate(()=>sim.hist.length));
 // Reloaded progress must appear on both route and gallery, including a partial total.
 await p.evaluate(()=>localStorage.setItem('cs-lab-force-balance-v3',JSON.stringify([true,false,true,false,false,false,false])));
 await p.goto(base,{waitUntil:'networkidle0'});assert.match(await p.$eval('#inquiryPath .progress-dots',e=>e.getAttribute('aria-label')),/2개 완료/);
 assert.deepEqual(errors,[]);fs.writeFileSync(path.join(out,'edge-validation.json'),JSON.stringify({passed:true,checks:['keyboard drawer','assumption dialog focus','six graph points = six table rows','axis selection','maximum arrows in bounds','friction mode parity','graph data accessibility','gallery progress'],samples,errors},null,2));
 console.log('EDGE ALL PASS');
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();});
