const assert=require('node:assert/strict');
const pp=require(process.env.PUPPETEER_PATH||'puppeteer-core');
(async()=>{const b=await pp.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});try{
 const p=await b.newPage();let count=0;
 for(const id of ['gravity','elasticity']){
  await p.goto(`http://127.0.0.1:7101/labs/${id}/?mode=learn`);
  const result=await p.evaluate(id=>{
   const oldRandom=Math.random;const failures=[];let n=0;
   try{book.clear();lab.mi=0;
    const cases=id==='gravity'?['earth','moon'].flatMap(planet=>[1,2,3,4,5,6].map(mass=>({planet,mass,reference:mass,scene:'weigh'}))):['a','b'].flatMap(spring=>Array.from({length:26},(_,delta)=>({spring,delta})));
    const button=[...document.querySelectorAll('.abtn')].find(e=>e.textContent.includes('측정·기록'));
    if(!button)throw Error('record button missing');
    for(const state of cases)for(const extreme of [0,1]){Object.assign(lab.state,state);Math.random=()=>extreme;const before=book.rows.length;button.click();n++;if(book.rows.length!==before+1)failures.push({state,extreme});}
   }finally{Math.random=oldRandom;book.clear();}return {n,failures};
  },id);assert.deepEqual(result.failures,[],id+' rounded endpoint rejected');count+=result.n;
 }console.log(`PASS ${count} sensor noise endpoints including rounding`);
}finally{await b.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
