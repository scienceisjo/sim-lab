const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const out=process.env.TEST_OUTPUT||path.resolve('test-results/gas-usability');fs.mkdirSync(out,{recursive:true});const result={errors:[],checks:[],screens:[]};let browser;
(async()=>{
 browser=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const p=await browser.newPage();p.on('pageerror',e=>result.errors.push(e.message));await p.setViewport({width:1920,height:1080});await p.goto('http://127.0.0.1:7101/labs/syringe-particles/?mode=model');
 const click=async(sel,text)=>{const h=await p.evaluateHandle((sel,text)=>[...document.querySelectorAll(sel)].find(e=>e.textContent.trim()===text&&e.getClientRects().length),sel,text);assert.ok(h.asElement(),text);await h.asElement().click();};
 assert.equal(await p.evaluate(()=>lab.running),true);
 await click('.seg button','압력을 같게 두기');await click('.abtn','200 ℃와 비교');assert.equal(await p.evaluate(()=>lab.running),true);
 const before=await p.evaluate(()=>sim.ps.map(p=>[p.x,p.y]));await new Promise(r=>setTimeout(r,250));assert.notDeepEqual(await p.evaluate(()=>sim.ps.map(p=>[p.x,p.y])),before);
 await click('.pbtn','⏸ 멈춤');
 result.retune=await p.evaluate(()=>{
  const checks=[];for(const temperature of [20,80,200,300,0,20]){
   const before=sim.ps.map(p=>({...p})),oldRms=rms(sim),oldW=sim.w;lab.state.temperature=temperature;retune(lab);const after=values(lab.state),factor=after.motion/oldRms;
   checks.push({temperature,ratioError:Math.max(...sim.ps.map((p,i)=>Math.abs(p.vx-before[i].vx*factor)+Math.abs(p.vy-before[i].vy*factor))),positionError:Math.max(...sim.ps.map((p,i)=>Math.abs((p.x-2)/(sim.w-4)-(before[i].x-2)/(oldW-4))+Math.abs(p.y-before[i].y))),motion:rms(sim),target:after.motion,traceReset:sim.trace.length===0});
  }return checks;
 });
 for(const c of result.retune){assert.ok(c.ratioError<1e-10&&c.positionError<1e-10);assert.ok(Math.abs(c.motion-c.target)<1e-9);assert.ok(c.traceReset);}
 await click('.abtn','200 ℃와 비교');assert.equal(await p.evaluate(()=>lab.running),false);const paused=await p.evaluate(()=>JSON.stringify(sim.ps));await new Promise(r=>setTimeout(r,180));assert.equal(await p.evaluate(()=>JSON.stringify(sim.ps)),paused);
 await click('.pbtn','▶ 재생');const t=await p.$('input[aria-label="기체의 온도"]');await t.focus();await p.keyboard.press('End');assert.equal(await p.evaluate(()=>lab.state.temperature),300);assert.equal(await p.evaluate(()=>lab.running),true);
 await p.focus('[data-view=scene]');await p.keyboard.press('Enter');assert.equal(await p.evaluate(()=>lab.modelVisible),false);assert.equal(await p.$eval('[data-view=scene]',e=>e.getAttribute('aria-pressed')),'true');assert.equal(await p.evaluate(()=>lab.running),true);
 await p.focus('[data-view=model]');await p.keyboard.press('Space');assert.equal(await p.evaluate(()=>lab.modelVisible),true);assert.equal(await p.$eval('[data-view=scene]',e=>e.getAttribute('aria-pressed')),'false');
 result.checks.push('Initial motion','Changing temperature preserves running','Paused remains paused','Velocity ratios preserve sqrt(T)','Relative positions and directions persist','Keyboard chooses explicit views');
 for(const [w,h]of [[1920,1080],[1366,768],[1024,768],[390,844]])for(const mode of ['model','learn'])for(const T of [20,300]){
  await p.setViewport({width:w,height:h});await p.goto('http://127.0.0.1:7101/labs/syringe-particles/?mode='+mode);await p.evaluate(T=>{lab.state.scene='heat';lab.state.temperature=T;retune(lab);lab.update();},T);await new Promise(r=>setTimeout(r,450));const name=`gas-live-${mode}-${T}C-${w}x${h}.png`;await p.screenshot({path:path.join(out,name)});result.screens.push(name);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 }
 // Shared view control regression: every kit-based lab, both modes, desktop and phone.
 const labs=fs.readdirSync('labs',{withFileTypes:true}).filter(d=>d.isDirectory()&&d.name!=='_kit'&&fs.existsSync(`labs/${d.name}/index.html`)&&fs.readFileSync(`labs/${d.name}/index.html`,'utf8').includes('_kit/kit.js')).map(d=>d.name);result.kitLabs=[];
 for(const id of labs){for(const mode of ['model','learn'])for(const [width,height]of [[1366,768],[390,844]]){
  await p.setViewport({width,height});await p.goto(`http://127.0.0.1:7101/labs/${id}/?mode=${mode}`);await p.waitForFunction(()=>window.lab);await p.click('[data-view=scene]');assert.equal(await p.evaluate(()=>lab.modelVisible),false);await p.click('[data-view=model]');assert.equal(await p.evaluate(()=>lab.modelVisible),true);assert.equal(await p.$$eval('.view-select [aria-pressed=true]',es=>es.length),1);assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${id} ${mode} ${width}`);
 }result.kitLabs.push(id);}
 assert.deepEqual(result.errors,[]);console.log(`PASS usability, ${result.kitLabs.length} kit labs, ${result.screens.length} live screenshots`);
})().catch(e=>{result.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'usability-validation.json'),JSON.stringify(result,null,2));if(browser)await browser.close();});
