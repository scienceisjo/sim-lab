const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const out=process.env.TEST_OUTPUT||'test-results/thermal-views';fs.mkdirSync(out,{recursive:true});let b;const report={screens:[],errors:[],colors:[]};
(async()=>{b=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const p=await b.newPage();p.on('pageerror',e=>report.errors.push(e.message));
 for(const [width,height]of [[1920,1080],[1366,768],[1024,768],[390,844]])for(const mode of ['model','learn'])for(const focus of ['all','conduction','convection','radiation']){
  await p.setViewport({width,height});await p.goto('http://127.0.0.1:7101/labs/heat-three-ways/?mode='+mode);await p.waitForFunction(()=>window.lab);
  await p.evaluate(focus=>{configure(lab,{power:'strong',flow:true,shield:false,focus});for(let i=0;i<6000;i++)tick(lab.state);sim.t=120;lab.update();},focus);await new Promise(r=>setTimeout(r,100));assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const name=`heat-three-ways-${focus}-${mode}-${width}x${height}.png`;await p.screenshot({path:path.join(out,name)});report.screens.push(name);
 }
 await p.setViewport({width:1366,height:768});
 for(const id of ['heat-equilibrium','thermal-expansion','syringe-particles','state-change-particles','conduction-camera','phase-heat-curves','specific-heat','bimetal-switch','cookware-test-bench','sea-land-breeze']){
  await p.goto(`http://127.0.0.1:7101/labs/${id}/?mode=model`);await p.waitForFunction(()=>window.lab);assert.ok(await p.evaluate(()=>document.body.textContent.includes('실제 입자의 색이 아닙니다.')));
  const x=await p.evaluate(()=>[Thermal.color(5),Thermal.color(60),Thermal.color(100)]);report.colors.push({id,colors:x});
  const name=`${id}-temperature-model.png`;await p.screenshot({path:path.join(out,name)});report.screens.push(name);
 }
 assert.deepEqual(report.errors,[]);console.log('PASS four thermal focus views × four screens × two modes; shared temperature colors');
})().catch(e=>{report.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'view-validation.json'),JSON.stringify(report,null,2));if(b)await b.close();});
