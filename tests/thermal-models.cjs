const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {Lattice,Pan,color,disks}=require('../labs/_kit/thermal.js');
const out=process.env.TEST_OUTPUT||'test-results/thermal-models';fs.mkdirSync(out,{recursive:true});const result={};
for(const [n,w,h,r]of [[48,210,110,8],[40,230,130,10]]){const ps=disks(n,w,h,r);assert.equal(ps.length,n);for(const [i,p]of ps.entries()){assert.ok(p.x>=r&&p.x<=w-r&&p.y>=r&&p.y<=h-r);for(const q of ps.slice(i+1))assert.ok(Math.hypot(p.x-q.x,p.y-q.y)>=2*r);}assert.ok(new Set(ps.map(p=>p.y)).size>n/2);}
// An isolated lattice must conserve energy and transfer a local disturbance to
// a neighbour that was initially still; no clock-derived sine wave is involved.
const lattice=new Lattice(12,3);lattice.q.fill(0);lattice.v.fill(0);lattice.v[0]=20;const e0=lattice.energy();let maxError=0,maxNeighbour=0;
for(let i=0;i<7200;i++){lattice.step(1/720,20,false);maxError=Math.max(maxError,Math.abs(lattice.energy()/e0-1));maxNeighbour=Math.max(maxNeighbour,Math.abs(lattice.v[2]));}
assert.ok(maxError<.001);assert.ok(maxNeighbour>1);result.lattice={maxRelativeEnergyError:maxError,neighbourMaxSpeed:maxNeighbour,initialEnergy:e0};
const p=new Pan();p.u=.01;let maxDiv=0;
for(let y=0;y<p.ny;y++)for(let x=0;x<p.nx;x++){const a=x*p.dx,b=(x+1)*p.dx,c=y*p.dy,d=(y+1)*p.dy;const flux=(p.psi(b,d)-p.psi(b,c))-(p.psi(a,d)-p.psi(a,c))-(p.psi(b,d)-p.psi(a,d))+(p.psi(b,c)-p.psi(a,c));maxDiv=Math.max(maxDiv,Math.abs(flux));}
assert.ok(maxDiv<1e-15);assert.ok(p.velocity(.5,.5).y>0);assert.ok(p.velocity(.05,.5).y<0);assert.ok(p.velocity(.95,.5).y<0);result.flow={maxDivergence:maxDiv};
for(let i=0;i<3000;i++)p.step(.02,20,.01);assert.ok(p.T.every(t=>Math.abs(t-20)<1e-10));
function run(dt,flow){const p=new Pan();let pan=20,supply=0,loss=0,u=0;for(let i=0;i<Math.round(60/dt);i++){const m=p.means();u=flow?Math.max(0,u+dt*(9.8*.0003*(m.lower-m.upper)*.2-10*u*u)):0;const q=p.step(dt,pan,u),air=.4*(pan-20);pan+=dt*(300-q.fromPan-air)/180;supply+=300*dt;loss+=dt*(q.loss+air);}const energy=pan*180+p.T.reduce((a,b)=>a+b,0)*p.capacity;return {pan,...p.means(),error:energy-(180+4180)*20-supply+loss,T:[...p.T]};}
const coarse=run(.02,true),fine=run(.01,true),blocked=run(.02,false);assert.ok(Math.abs(coarse.error)<1e-6);assert.ok(Math.abs(blocked.error)<1e-6);assert.ok(coarse.upper>blocked.upper+1);const difference=Math.max(...coarse.T.map((v,i)=>Math.abs(v-fine.T[i])));assert.ok(difference<.05);result.pan={coarse,fine,blocked,maxTimestepDifference:difference};
assert.notEqual(color(5),color(60));assert.equal(color(33),color(33));assert.notEqual(color(60),color(300));result.colors=[-78.5,0,5,20,33,60,100,300].map(t=>({t,color:color(t)}));
fs.writeFileSync(path.join(out,'model-validation.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({lattice:result.lattice,flow:result.flow,energyError:coarse.error,convergence:difference,flowUpper:coarse.upper,blockedUpper:blocked.upper}));
