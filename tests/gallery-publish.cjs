/* Generate actual model thumbnails and verify gallery routes before publication.
 * PUPPETEER_PATH, TEST_OUTPUT, LAB_URL; GENERATE_THUMBS=1 writes thumbs/*.jpg.
 * Public smoke check: LAB_URL=https://scienceisjo.github.io/sim-lab
 */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const base=process.env.LAB_URL||'http://127.0.0.1:7101';
assert.match(base,/^(http:\/\/127\.0\.0\.1:71\d\d|https:\/\/scienceisjo\.github\.io\/sim-lab)$/);
const out=process.env.TEST_OUTPUT||path.resolve('test-results');fs.mkdirSync(out,{recursive:true});
const ids=[...require('../curriculum/existing.json'),...require('../curriculum/labs.json')].map(x=>x.id);
const report={labs:[],screens:[],errors:[],httpErrors:[]};let browser;
(async()=>{
 browser=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const p=await browser.newPage();
 p.on('pageerror',e=>report.errors.push(e.message));p.on('response',r=>{if(r.url().startsWith(base)&&r.status()>=400)report.httpErrors.push({url:r.url(),status:r.status()});});
 await p.setViewport({width:1366,height:768});
 for(const id of ids){
  await p.goto(`${base}/labs/${id}/?mode=model`,{waitUntil:'networkidle0'});await p.waitForFunction(()=>window.lab&&document.querySelector('canvas.board')?.width>0);
  assert.equal(await p.evaluate(()=>lab.mode),'model');
  if(process.env.GENERATE_THUMBS==='1'){
   const data=await p.evaluate(()=>{const cv=document.querySelector('canvas.board'),dst=document.createElement('canvas');dst.width=640;dst.height=400;dst.getContext('2d').drawImage(cv,0,0,640,400);return dst.toDataURL('image/jpeg',.9).split(',')[1];});
   fs.writeFileSync(path.join(__dirname,'../thumbs',id+'.jpg'),Buffer.from(data,'base64'));
  }
  await p.click('[data-mode=learn]');assert.equal(await p.evaluate(()=>lab.mode),'learn');
  report.labs.push(id);
 }
 for(const [width,height]of [[1920,1080],[1366,768],[1024,768],[390,844]]){
  await p.setViewport({width,height});await p.goto(base+'/',{waitUntil:'networkidle0'});
  assert.equal(await p.$$eval('.mode-actions',es=>es.length),63);assert.equal(await p.$$eval('#grid .card',es=>es.length),134);
  assert.equal(await p.$$eval('#inquiryPath .pending',es=>es.length),0);
  assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const names=await p.evaluate(()=>SIMS.map(x=>x.id));assert.equal(new Set(names).size,134);
  const images=await p.evaluate(async()=>{const result=[];for(const s of SIMS){const img=new Image();img.src='thumbs/'+s.id+'.jpg';try{await img.decode();result.push({id:s.id,w:img.naturalWidth,h:img.naturalHeight});}catch{result.push({id:s.id,error:true});}}return result;});
  assert.equal(images.filter(x=>x.error).length,0);
  for(const img of images.filter(x=>ids.includes(x.id))){assert.equal(img.w,640);assert.equal(img.h,400);}
  const shot=`gallery-${width}x${height}.png`;await p.screenshot({path:path.join(out,shot)});report.screens.push(shot);
 }
 await p.type('#q','세포');assert.ok(await p.$$eval('#grid .card',es=>es.length)>0);
 await p.$eval('#q',e=>{e.value='';e.dispatchEvent(new Event('input'));});
 await p.evaluate(()=>localStorage.setItem('cs-lab-density-lab-v1',JSON.stringify([true,false,true,false])));await p.reload();
 assert.match(await p.$eval('[data-id="density-lab"] .progress-dots',e=>e.textContent),/2\/4/);
 await p.click('.curriculum-link a');await p.waitForSelector('#units .card');assert.equal(await p.$$eval('.unit',es=>es.length),23);
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.httpErrors,[]);console.log('PASS 63 labs, 134 gallery cards, all thumbnails, four screens, routes and progress');
})().catch(e=>{report.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'gallery-validation.json'),JSON.stringify(report,null,2));if(browser)await browser.close();});
