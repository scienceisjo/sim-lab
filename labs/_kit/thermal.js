/* Shared temperature encodings and explanatory thermal models.
 * Colours encode ensemble/local temperature, never an individual molecule's
 * temperature or its visible colour. No measurement noise enters these models.
 */
(function(root){
'use strict';
const stops=[[-80,[30,40,100]],[-20,[39,64,145]],[0,[41,103,206]],[20,[37,155,205]],[40,[235,182,57]],[60,[242,111,40]],[100,[210,49,55]],[300,[130,34,96]]];
function color(t){t=Math.max(-80,Math.min(300,t));for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const [a,A]=stops[i-1],[b,B]=stops[i],f=(t-a)/(b-a);return `rgb(${A.map((v,j)=>Math.round(v+(B[j]-v)*f)).join(',')})`;}return 'rgb(130,34,96)';}
function legend(c,l,x,y,w=300,lo=0,hi=100){const fs=l.fs(14);c.save();for(let i=0;i<w;i++){c.fillStyle=color(lo+(hi-lo)*i/(w-1));c.fillRect(x+i,y,w===1?1:1.2,12);}c.font=`600 ${fs}px system-ui,"Malgun Gothic",sans-serif`;c.textAlign='center';c.fillStyle='#334155';c.fillText(lo+' ℃',x,y+12+fs);c.fillText(hi+' ℃',x+w,y+12+fs);c.fillText('온도 색',x+w/2,y+12+fs);c.restore();}
function note(l,extra='',ticks=[0,20,40,60,100]){const g=l.ui.group('온도 색 읽기');const n=document.createElement('p');n.style.cssText='margin:0;line-height:1.65;font-size:14px';n.textContent='색은 그 부분의 평균 온도이며 실제 입자의 색이 아닙니다.';g.append(n);const details=document.createElement('details'),summary=document.createElement('summary'),more=document.createElement('p');summary.textContent='색과 모형의 뜻';more.textContent='푸른색은 낮은 온도, 주황·붉은색은 높은 온도입니다. '+extra;more.style.cssText='font-size:14px;line-height:1.65';details.append(summary,more);g.append(details);const bar=document.createElement('div');bar.style.cssText='height:12px;margin-top:12px;border-radius:6px;background:linear-gradient(90deg,'+ticks.map(color).join(',')+')';bar.setAttribute('aria-hidden','true');g.append(bar);const labels=document.createElement('div');labels.style.cssText='display:flex;justify-content:space-between;font-size:13px;margin-top:4px';labels.innerHTML=ticks.map(t=>'<span>'+t+' ℃</span>').join('');g.append(labels);return g;}
function random(seed){let s=seed>>>0;return()=>{s=(1664525*s+1013904223)>>>0;return(s+.5)/4294967296;};}
function disks(n,w,h,r,seed=101,speed=25){const rng=random(seed),ps=[];for(let tries=0;ps.length<n&&tries<50000;tries++){const p={x:r+rng()*(w-2*r),y:r+rng()*(h-2*r)},a=rng()*Math.PI*2;p.vx=speed*Math.cos(a);p.vy=speed*Math.sin(a);if(ps.every(q=>Math.hypot(q.x-p.x,q.y-p.y)>=2*r+.1))ps.push(p);}if(ps.length!==n)throw Error('Particle packing is too dense');return ps;}
// Isotropic harmonic neighbour coupling plus a harmonic restoring potential.
// Velocity Verlet is conservative when bath=false. A Langevin bath otherwise
// links this explanatory microscope to the separately calculated local T.
class Lattice{
 constructor(nx=14,ny=3,seed=71){this.nx=nx;this.ny=ny;this.n=nx*ny;this.k=420;this.anchor=780;this.rng=random(seed);this.q=new Float64Array(this.n*2);this.v=new Float64Array(this.n*2);this.f=new Float64Array(this.n*2);this.links=[];this.acc=0;this.time=0;this.trace=[];for(let i=0;i<this.n;i++){if(i%nx<nx-1)this.links.push([i,i+1]);if(i+nx<this.n)this.links.push([i,i+nx]);for(let a=0;a<2;a++)this.v[i*2+a]=this.normal()*25;}this.force();}
 normal(){return Math.sqrt(-2*Math.log(this.rng()))*Math.cos(2*Math.PI*this.rng());}
 force(){for(let i=0;i<this.q.length;i++)this.f[i]=-this.anchor*this.q[i];for(const [i,j]of this.links)for(let a=0;a<2;a++){const v=this.k*(this.q[j*2+a]-this.q[i*2+a]);this.f[i*2+a]+=v;this.f[j*2+a]-=v;}}
 step(dt,temperature,bath=true){this.force();for(let i=0;i<this.q.length;i++){this.v[i]+=.5*dt*this.f[i];this.q[i]+=dt*this.v[i];}this.force();const decay=Math.exp(-2*dt);for(let i=0;i<this.v.length;i++){this.v[i]+=.5*dt*this.f[i];if(bath){const T=typeof temperature==='function'?temperature(Math.floor(i/2)%this.nx,Math.floor(Math.floor(i/2)/this.nx)):temperature;const sigma=25*Math.sqrt(Math.max(1,T+273.15)/293.15);this.v[i]=decay*this.v[i]+Math.sqrt(1-decay*decay)*sigma*this.normal();}}this.time+=dt;}
 advance(dt,temperature){if(root.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;this.acc+=Math.min(.05,Math.max(0,dt));while(this.acc>=1/720){this.step(1/720,temperature);this.acc-=1/720;}const i=Math.floor(this.n/2);this.trace.push([this.q[2*i],this.q[2*i+1]]);if(this.trace.length>30)this.trace.shift();}
 energy(){let e=0;for(let i=0;i<this.q.length;i++)e+=.5*this.v[i]**2+.5*this.anchor*this.q[i]**2;for(const [i,j]of this.links)for(let a=0;a<2;a++)e+=.5*this.k*(this.q[j*2+a]-this.q[i*2+a])**2;return e;}
 draw(c,x,y,w,h,temperature){const sx=w/(this.nx+1),sy=h/(this.ny+1),scale=Math.min(5,sx/7,sy/7),r=Math.min(7,sx*.19,sy*.21),point=i=>[x+(i%this.nx+1)*sx+scale*this.q[i*2],y+(Math.floor(i/this.nx)+1)*sy+scale*this.q[i*2+1]];c.save();c.beginPath();c.rect(x,y,w,h);c.clip();c.lineWidth=1.4;c.strokeStyle='#a5b9ce';for(const [i,j]of this.links){const a=point(i),b=point(j);c.beginPath();c.moveTo(...a);c.lineTo(...b);c.stroke();}for(let i=0;i<this.n;i++){const [px,py]=point(i),T=temperature(i%this.nx,Math.floor(i/this.nx));c.strokeStyle='#bac9d5';c.lineWidth=1;c.beginPath();c.arc(x+(i%this.nx+1)*sx,y+(Math.floor(i/this.nx)+1)*sy,r+5,0,2*Math.PI);c.stroke();c.fillStyle=color(T);c.beginPath();c.arc(px,py,r,0,2*Math.PI);c.fill();c.strokeStyle='#294358';c.stroke();if(i===Math.floor(this.n/2)){c.strokeStyle='#111827';c.lineWidth=2.4;c.beginPath();c.arc(px,py,r+3,0,2*Math.PI);c.stroke();}}c.restore();}
}
// Conservative finite-volume temperature transport. A divergence-free two-roll
// streamfunction describes a closed pan: upward in the middle, down at the walls.
// Its magnitude comes from the buoyancy/drag equation in the lab. This is NOT a
// full Navier–Stokes solver, and that limitation is exposed in the teacher notes.
class Pan{
 constructor(nx=18,ny=12){this.nx=nx;this.ny=ny;this.w=.24;this.h=.16;this.dx=this.w/nx;this.dy=this.h/ny;this.depth=.001/(this.w*this.h);this.capacity=4180/(nx*ny);this.T=new Float64Array(nx*ny).fill(20);this.q=new Float64Array(nx*ny);this.u=0;this.markers=Array.from({length:90},(_,i)=>({x:.04+.92*((i*.61803398875)%1),y:.04+.92*((i*.41421356237+.2)%1)}));}
 psi(x,y){return this.u*this.w/(2*Math.PI)*Math.sin(2*Math.PI*x/this.w)*Math.sin(Math.PI*y/this.h);}
 velocity(x,y){return {x:this.u*this.w/(2*this.h)*Math.sin(2*Math.PI*x)*Math.cos(Math.PI*y),y:-this.u*Math.cos(2*Math.PI*x)*Math.sin(Math.PI*y)};}
 means(){let low=0,high=0;for(let y=0;y<this.ny;y++)for(let x=0;x<this.nx;x++)if(y<this.ny/2)low+=this.T[y*this.nx+x];else high+=this.T[y*this.nx+x];return {lower:low*2/this.T.length,upper:high*2/this.T.length};}
 at(x,y){return this.T[Math.min(this.ny-1,Math.max(0,Math.floor(y*this.ny)))*this.nx+Math.min(this.nx-1,Math.max(0,Math.floor(x*this.nx)))];}
 step(dt,panTemperature,speed){this.u=speed;this.q.fill(0);const n=this.nx,m=this.ny,cv=4180000,conductivity=.6;
  const exchange=(i,j,volume,conductance)=>{const flux=cv*volume*(volume>=0?this.T[i]:this.T[j])+conductance*(this.T[i]-this.T[j]);this.q[i]-=flux;this.q[j]+=flux;};
  for(let y=0;y<m;y++)for(let x=0;x<n;x++){const i=y*n+x;if(x<n-1){const xx=(x+1)*this.dx,vol=this.depth*(this.psi(xx,(y+1)*this.dy)-this.psi(xx,y*this.dy));exchange(i,i+1,vol,conductivity*this.depth*this.dy/this.dx);}if(y<m-1){const yy=(y+1)*this.dy,vol=-this.depth*(this.psi((x+1)*this.dx,yy)-this.psi(x*this.dx,yy));exchange(i,i+n,vol,conductivity*this.depth*this.dx/this.dy);}}
  let fromPan=0,loss=0;const heated=[];for(let x=0;x<n;x++)if(Math.abs((x+.5)/n-.5)<.28)heated.push(x);
  for(const x of heated){const flux=100/heated.length*(panTemperature-this.T[x]);this.q[x]+=flux;fromPan+=flux;}
  for(let y=0;y<m;y++)for(let x=0;x<n;x++){const i=y*n+x;const air=(y<m/2?.3:2)/(n*m/2)*(this.T[i]-20);this.q[i]-=air;loss+=air;}
  for(let i=0;i<this.T.length;i++)this.T[i]+=dt*this.q[i]/this.capacity;
  for(const p of this.markers){const v=this.velocity(p.x,p.y),mx=p.x+.5*dt*v.x/this.w,my=p.y+.5*dt*v.y/this.h,mid=this.velocity(mx,my);p.x=Math.max(.002,Math.min(.998,p.x+dt*mid.x/this.w));p.y=Math.max(.002,Math.min(.998,p.y+dt*mid.y/this.h));}
  return {fromPan,loss};
 }
 draw(c,x,y,w,h,show=true){c.save();c.beginPath();c.rect(x,y,w,h);c.clip();if(show){if(!this.texture){this.texture=document.createElement('canvas');this.texture.width=this.nx;this.texture.height=this.ny;}const tc=this.texture.getContext('2d'),im=tc.createImageData(this.nx,this.ny);for(let j=0;j<this.ny;j++)for(let i=0;i<this.nx;i++){const rgb=color(this.T[j*this.nx+i]).match(/\d+/g).map(Number),k=((this.ny-1-j)*this.nx+i)*4;im.data[k]=rgb[0];im.data[k+1]=rgb[1];im.data[k+2]=rgb[2];im.data[k+3]=255;}tc.putImageData(im,0,0);c.globalAlpha=.3;c.imageSmoothingEnabled=true;c.drawImage(this.texture,x,y,w,h);c.globalAlpha=1;for(const p of this.markers){const px=x+p.x*w,py=y+(1-p.y)*h,v=this.velocity(p.x,p.y);c.strokeStyle=color(this.at(p.x,p.y));c.lineWidth=2.2;c.beginPath();c.moveTo(px-v.x/this.w*w*.35,py+v.y/this.h*h*.35);c.lineTo(px,py);c.stroke();c.fillStyle=color(this.at(p.x,p.y));c.beginPath();c.arc(px,py,Math.max(3,w/140),0,2*Math.PI);c.fill();c.strokeStyle='#29435880';c.lineWidth=.8;c.stroke();}}else{c.fillStyle='#c6e8f4';c.fillRect(x,y,w,h);}c.restore();}
}
root.Thermal={color,tint:t=>color(t).replace('rgb(','rgba(').replace(')',',.18)'),legend,note,disks,Lattice,Pan};
if(typeof module!=='undefined')module.exports=root.Thermal;
})(typeof window!=='undefined'?window:globalThis);
