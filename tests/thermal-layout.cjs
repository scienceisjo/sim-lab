const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
const out=process.env.TEST_OUTPUT||'test-results/thermal-layout';fs.mkdirSync(out,{recursive:true});let b;
(async()=>{b=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});const p=await b.newPage();await p.goto('http://127.0.0.1:7101/labs/heat-three-ways/?mode=model');const result=await p.evaluate(()=>{
 const cv=document.createElement('canvas');cv.width=960;cv.height=600;const c=cv.getContext('2d');let labels=[];const fill=c.fillText.bind(c);c.fillText=(t,x,y)=>{const m=c.measureText(t);labels.push({text:t,x:x-m.actualBoundingBoxLeft,y:y-m.actualBoundingBoxAscent,w:m.actualBoundingBoxLeft+m.actualBoundingBoxRight,h:m.actualBoundingBoxAscent+m.actualBoundingBoxDescent});fill(t,x,y);};
 const old=lab.fs;lab.fs=x=>Math.max(30,x);const bad=[],clipped=[];let cases=0;
 for(const focus of ['all','conduction','convection','radiation'])for(const power of ['off','strong'])for(const shield of [false,true]){configure(lab,{focus,power,shield,flow:true});for(let i=0;i<3000;i++)tick(lab.state);labels=[];lab.cfg.draw(c,lab);cases++;
  for(const a of labels)if(a.x<0||a.x+a.w>960||a.y<0||a.y+a.h>600)clipped.push({focus,text:a.text,box:a});
  for(let i=0;i<labels.length;i++)for(let j=i+1;j<labels.length;j++){const a=labels[i],b=labels[j],dx=Math.min(a.x+a.w,b.x+b.w)-Math.max(a.x,b.x),dy=Math.min(a.y+a.h,b.y+b.h)-Math.max(a.y,b.y);if(dx>3&&dy>3)bad.push({focus,a:a.text,b:b.text,dx,dy});}
 }lab.fs=old;return{cases,bad,clipped};});fs.writeFileSync(path.join(out,'layout-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));assert.equal(result.bad.length,0);assert.equal(result.clipped.length,0);
})().catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{if(b)await b.close();});
