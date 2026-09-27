const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const defs=require('./fixtures/curriculum.json'),out=process.env.TEST_OUTPUT||path.resolve('test-results/curriculum');fs.mkdirSync(out,{recursive:true});let browser;
const result={cases:0,overlaps:[],clipped:[],errors:[]};
(async()=>{browser=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const p=await browser.newPage();p.on('pageerror',e=>result.errors.push(e.message));
 for(const d of defs){await p.goto(`http://127.0.0.1:7101/labs/${d.id}/?mode=model`);await p.waitForFunction(()=>window.lab?.science);const scan=await p.evaluate(()=>{
  const def=lab.science.definition,cv=document.createElement('canvas');cv.width=960;cv.height=600;const c=cv.getContext('2d');let texts=[];const orig=c.fillText.bind(c);c.fillText=(text,x,y)=>{const w=c.measureText(text).width,size=parseFloat(c.font.match(/[\d.]+px/)[0]);const left=c.textAlign==='left'?x:c.textAlign==='right'?x-w:x-w/2;texts.push({text,x:left,y:y-size*.45,w,h:size*.9});orig(text,x,y);};
  let states=[{}];for(const control of def.controls){const vs=control.options?control.options.map(x=>x[0]):[control.min,control.value,control.max];states=states.flatMap(s=>vs.map(v=>({...s,[control.key]:v})));}
  const bad=[],clipped=[];for(const s of states){texts=[];c.clearRect(0,0,960,600);def.draw(Explorer.painter(c,{fs:x=>Math.max(30,x)}),s,def.evaluate(s),true,{sceneTime:.17});
   for(const a of texts)if(a.x<20||a.x+a.w>940||a.y<55||a.y+a.h>493)clipped.push({state:s,text:a.text,box:a});
   for(let i=0;i<texts.length;i++)for(let j=i+1;j<texts.length;j++){const a=texts[i],b=texts[j],dx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),dy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(dx>5&&dy>5)bad.push({state:s,a:a.text,b:b.text,overlap:[dx,dy]});}
  }return {cases:states.length,bad,clipped};});result.cases+=scan.cases;result.overlaps.push(...scan.bad.map(x=>({id:d.id,...x})));result.clipped.push(...scan.clipped.map(x=>({id:d.id,...x})));
 }
 console.log(JSON.stringify({cases:result.cases,overlaps:result.overlaps.length,clipped:result.clipped.length,examples:result.overlaps.slice(0,12),clippedExamples:result.clipped.slice(0,12)},null,2));assert.deepEqual(result.errors,[]);assert.equal(result.overlaps.length,0);assert.equal(result.clipped.length,0);
})().catch(e=>{result.failure=e.stack;console.error(e);process.exitCode=1;}).finally(async()=>{fs.writeFileSync(path.join(out,'visual-layout.json'),JSON.stringify(result,null,2));if(browser)await browser.close();});
