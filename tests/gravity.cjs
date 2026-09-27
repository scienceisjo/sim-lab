const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const out=process.env.TEST_OUTPUT||path.resolve('test-results/gravity');fs.mkdirSync(out,{recursive:true});
const url='http://127.0.0.1:7101/labs/gravity/';
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-8,`${a} != ${b}`);
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const result={numeric:[],missions:[],screenshots:[],errors:[]};let browser;
(async()=>{browser=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const p=await browser.newPage();p.on('pageerror',e=>result.errors.push(e.message));p.on('console',m=>{if(m.type()==='error')result.errors.push(m.text());});
 await p.setViewport({width:1920,height:1080});await p.goto(url+'?mode=learn');await p.evaluate(()=>localStorage.clear());await p.reload();
 for(const mode of ['model','learn']){
  await p.goto(url+'?mode='+mode);const vals=await p.evaluate(()=>{const rs=[];for(const planet of ['earth','moon'])for(const mass of [1,2,6]){Object.assign(lab.state,{planet,mass,scene:'throw'});lab.rewind();for(let i=0;i<9;i++)lab.cfg.step(1/60,lab);rs.push({planet,mass,W:weight(lab.state),t:sim.t,y:sim.y,v:sim.v});}return rs;});
  for(const r of vals){const g=r.planet==='earth'?9.8:9.8/6;near(r.W,r.mass*g);near(r.t,.15);near(r.y,3*.15-g*.15*.15/2);near(r.v,3-g*.15);}result.numeric.push({mode,values:vals});
 }assert.deepEqual(result.numeric[0].values,result.numeric[1].values);
 await p.evaluate(()=>localStorage.clear());await p.goto(url+'?mode=learn');
 async function click(sel,text){const el=await p.evaluateHandle((s,t)=>[...document.querySelectorAll(s)].find(e=>e.textContent.trim()===t),sel,text);assert.ok(el.asElement(),text);await el.asElement().click();}
 async function card(i,enter=false){await p.click(`.mcard:nth-child(${i+1}) .t`);await sleep(100);if(enter)await p.click('.mcard.on .enter-btn');}
 async function record(){await click('.abtn','무게 측정·기록');}
 async function done(i){assert.equal(await p.evaluate(i=>!!lab.done[i],i),true);result.missions.push(i+1);}
 await click('.seg button','달');await click('.seg button','지구');await click('.seg button','천체 전체');await done(0);
 await card(1,true);assert.equal(await p.$eval('.pbtn.main',e=>e.disabled),true);await record();assert.equal(await p.evaluate(()=>book.rows.length),0);
 await p.click('.mcard.on .pred button:nth-child(2)');await record();assert.equal(await p.evaluate(()=>!!lab.done[1]),false);await click('.seg button','달');await record();await done(1);
 await card(2,true);await p.focus('input[aria-label="분동의 질량"]');await p.keyboard.press('End');await record();await click('.seg button','달');await record();await done(2);
 await card(3,true);await p.click('.pbtn.main');await sleep(850);await done(3);
 await card(4);await p.select('.mcard.on select[aria-label="바꿀 것"]','planet');await p.select('.mcard.on select[aria-label="잴 것"]','measured');for(const k of ['mass','reference'])await p.click(`.mcard.on input[value="${k}"]`);await click('.mcard.on .abtn','이 설계로 실험하기');
 await click('.seg button','두 저울');await click('.seg button','지구');await record();await record();assert.equal(await p.evaluate(()=>!!lab.done[4]),false);await click('.seg button','달');await record();await done(4);
 await card(5);const blanks=await p.$$('.mcard.on .blank');for(let i=0;i<blanks.length;i++){await (await blanks[i].$$('button'))[0].click();if(i<2)assert.equal(await p.evaluate(()=>!!lab.done[5]),false);}await done(5);
 for(const [i,a]of [1,2,2].entries()){await p.click(`.quiz-question:nth-of-type(${i+1}) .quiz-options button:nth-child(${a+1})`);assert.match(await p.$eval(`.quiz-question:nth-of-type(${i+1}) .quiz-feedback`,e=>e.textContent),/맞았습니다/);}
 await p.click('[data-mode="model"]');const rows=await p.evaluate(()=>book.rows.length);await p.evaluate(()=>{lab.complete(0);book.add({});});assert.equal(await p.evaluate(()=>book.rows.length),rows);
 for(const [w,h]of [[1920,1080],[1366,768],[1024,768],[390,844]])for(const mode of ['model','learn'])for(const scene of ['weigh','throw','globe']){
  await p.setViewport({width:w,height:h});await p.goto(url+'?mode='+mode);await p.evaluate(scene=>{setScene(lab,{scene});lab.update();},scene);await sleep(120);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const name=`gravity-${mode}-${scene}-${w}x${h}.png`;await p.screenshot({path:path.join(out,name)});result.screenshots.push(name);
 }
 assert.deepEqual(result.errors,[]);console.log('PASS gravity: numbers, 6 missions, 3 quizzes, 24 screens');
})().catch(e=>{result.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'validation.json'),JSON.stringify(result,null,2));if(browser)await browser.close();});
