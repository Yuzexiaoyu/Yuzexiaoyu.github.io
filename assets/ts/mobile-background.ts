export function initMobileBackground(): void {
  if (document.getElementById('warp-canvas')) return;
  const canvas = document.createElement('canvas'); canvas.id = 'warp-canvas';
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;z-index:-1;pointer-events:none';
  document.documentElement.insertBefore(canvas, document.body);
  const ctx = canvas.getContext('2d',{alpha:false});
  if (!ctx) return;
  const intro = document.querySelector<HTMLElement>('#page-loader.m-intro-home');
  let introCovering = !!intro && !intro.classList.contains('hidden') && intro.style.display !== 'none';
  let width = 1, height = 1, fadeProgress = 0, last = 0, raf = 0;
  const count = 110;
  let particles: {x:number;y:number;z:number;pz:number}[] = [];
  function resize() {
    const oldW = width, oldH = height;
    width = window.innerWidth; height = window.innerHeight;
    const dpr = Math.min(devicePixelRatio || 1,1.5);
    canvas.width = Math.round(width*dpr); canvas.height = Math.round(height*dpr);
    ctx!.setTransform(dpr,0,0,dpr,0,0); ctx!.fillStyle='#000'; ctx!.fillRect(0,0,width,height);
    particles = particles.length ? particles.map(p=>({x:p.x*width/oldW,y:p.y*height/oldH,z:1+(p.z-1)*(width*1.5-1)/(oldW*1.5-1),pz:1+(p.z-1)*(width*1.5-1)/(oldW*1.5-1)})) : Array.from({length:count},(_,i)=>{
      const z=1+(i+Math.random())/count*(width*1.5-1);
      return {x:Math.random()*width-width/2,y:Math.random()*height-height/2,z,pz:z};
    });
  }
  function draw(now:number) {
    raf=0;
    if (document.hidden || introCovering) { last=0; return; }
    const dt=last?Math.min((now-last)/(1000/60),3):2; last=now;
    // Clear bright trails faster on small screens while keeping short warp streaks.
    ctx!.fillStyle=`rgba(0,0,0,${1-Math.pow(.7,dt)})`;ctx!.fillRect(0,0,width,height);
    fadeProgress+=dt;
    if (fadeProgress>=8) { fadeProgress%=8;ctx!.globalCompositeOperation='color-burn';ctx!.fillStyle='rgb(254,254,254)';ctx!.fillRect(0,0,width,height);ctx!.globalCompositeOperation='source-over'; }
    for (const p of particles) {
      p.z-=5*dt;
      if(p.z<1){const depth=width*1.5-1;p.z=1+((p.z-1)%depth+depth)%depth;p.x=Math.random()*width-width/2;p.y=Math.random()*height-height/2;p.pz=p.z;}
      ctx!.beginPath();ctx!.moveTo(p.x/p.pz*width+width/2,p.y/p.pz*height+height/2);ctx!.lineTo(p.x/p.z*width+width/2,p.y/p.z*height+height/2);
      ctx!.strokeStyle=`rgba(100,210,255,${1-p.z/(width*1.5)})`;ctx!.lineWidth=1.5;ctx!.stroke();p.pz=p.z;
    }
    raf=requestAnimationFrame(draw);
  }
  function resume(){if(raf)cancelAnimationFrame(raf);raf=0;last=0;if(!document.hidden&&!introCovering)raf=requestAnimationFrame(draw);}
  resize();
  // The opaque opening covers every background pixel; resume when its fade begins.
  if (introCovering && intro) {
    const introObserver = new MutationObserver(() => {
      introCovering = intro.isConnected && !intro.classList.contains('hidden') && intro.style.display !== 'none';
      if (!introCovering) { introObserver.disconnect(); resume(); }
    });
    introObserver.observe(intro,{attributes:true,attributeFilter:['class','style']});
  }
  resume();
  window.addEventListener('resize',resize);
  document.addEventListener('visibilitychange',resume);
  window.addEventListener('pagehide',()=>{cancelAnimationFrame(raf);raf=0;last=0;});
  window.addEventListener('pageshow',resume);
}
