// Exercise the actual Hugo-built module entrance and navigation lifecycle.
const {readFileSync}=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const {test}=require('node:test');
const html=readFileSync('.local/print-workshop/site/prints/index.html','utf8');
const source=html.match(/<script id="workshop-intro-script">([\s\S]*?)<\/script>/)?.[1];
assert.ok(source,'Build the local Hugo site before running entrance tests');

function page({path='/',mobile=false,reduced=false,previous}={}){
  let now=0,sequence=0;const events={},speeds=[],animations=[],frames=new Map();
  class Element{
    constructor(name='module'){this.name=name;this.dataset={};this.inert=false;this.isConnected=true;this.groups=new Map();}
    querySelectorAll(selector){return this.groups.get(selector)||[];}
    animate(keyframes,timing){
      const animation={target:this,keyframes,timing,created:now,started:now,currentTime:0,playState:'running',cancelled:false,onfinish:null,
        pause(){if(this.playState==='running')this.currentTime=now-this.started;this.playState='paused';},
        play(){this.started=now-this.currentTime;this.playState='running';},
        cancel(){this.cancelled=true;this.playState='idle';}};
      animation.effect={updateTiming:update=>Object.assign(animation.timing,update)};
      animations.push(animation);return animation;
    }
  }
  const document={documentElement:new Element('html'),body:new Element('body'),visibilityState:'visible',addEventListener:(name,fn)=>{events[name]=fn;}};
  const window={WorkshopIntro:previous,__isMobileUI:()=>mobile,setWarpSpeed:value=>speeds.push(['desktop',value]),__mobileWarp:{setSpeed:value=>speeds.push(['mobile',value])},addEventListener:(name,fn)=>{events[name]=fn;}};
  vm.runInNewContext(source,{window,document,location:{href:'http://localhost'+path,origin:'http://localhost'},URL,performance:{now:()=>now},matchMedia:()=>({matches:reduced}),Map,WeakSet,Set,requestAnimationFrame:fn=>{frames.set(++sequence,fn);return sequence;},cancelAnimationFrame:id=>frames.delete(id)});
  const add=(root,selector,name)=>{const node=new Element(name),nodes=root.groups.get(selector)||[];nodes.push(node);root.groups.set(selector,nodes);return node;};
  return {window,document,Element,events,speeds,animations,add,
    root(kind='catalog',cards=0){const root=new Element('root');root.dataset.workshop=kind;add(root,':scope > .wk-nav > .wk-brand','brand');add(root,':scope > .wk-nav > .wk-nav-back','back');if(kind==='catalog'){add(root,'.wk-collection-toolbar','toolbar');for(let i=0;i<cards;i++)add(root,'.wk-grid > .wk-card','card'+i);}return root;},
    stall(time){now=time;},
    step(time){while(now<time){now=Math.min(now+16,time);const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn(now));for(const animation of animations)if(!animation.cancelled&&animation.playState==='running'){animation.currentTime=now-animation.started;if(animation.currentTime>=animation.timing.delay+animation.timing.duration)animation.onfinish?.();}}},
    phase(){return document.documentElement.dataset.workshopIntro;}
  };
}

test('direct entry never hides or locks the body before modules exist',()=>{
  const p=page({path:'/prints/'});
  assert.equal(p.document.documentElement.dataset.workshopEntry,'true');
  assert.equal(p.phase(),undefined);assert.equal(p.document.body.inert,false);assert.equal(p.animations.length,0);
  const root=p.root('catalog',1);p.window.WorkshopIntro.enter(root);
  assert.equal(p.phase(),'reveal');assert.equal(p.document.body.inert,false);
  assert.equal(p.speeds.length,0);
  assert.ok(p.animations.every(animation=>animation.target!==root&&animation.target!==p.document.body));
  p.step(1500);assert.equal(p.window.WorkshopIntro.active(),false);assert.equal(p.phase(),undefined);
  assert.ok(p.animations.every(animation=>animation.cancelled&&!animation.target.dataset.workshopReveal));
});

test('module order has a short capped card ripple',()=>{
  const p=page(),root=p.root('catalog',20);p.window.WorkshopIntro.enter(root);
  const [brand,back,toolbar,...cards]=p.animations;
  assert.equal(brand.target.name,'brand');assert.equal(back.target.name,'back');assert.equal(toolbar.target.name,'toolbar');
  assert.ok(brand.timing.delay<back.timing.delay&&back.timing.delay<toolbar.timing.delay&&toolbar.timing.delay<cards[0].timing.delay);
  assert.equal(brand.keyframes[0].transform,'translate3d(-24px,0px,0)');
  assert.equal(back.keyframes[0].transform,'translate3d(24px,0px,0)');
  assert.ok(cards[1].timing.delay>cards[0].timing.delay);
  assert.ok(cards.every(card=>card.timing.delay+card.timing.duration<=1400));
  assert.ok(cards.every(card=>card.keyframes[0].transform==='translate3d(0px,30px,0)'));
});

test('slow HTML navigation leaves the existing page usable without an animation clock',()=>{
  const p=page(),body=p.document.body;
  assert.equal(p.window.WorkshopIntro.navigate('/prints/','/'),true);
  p.step(10000);
  assert.equal(p.window.WorkshopIntro.active(),false);assert.equal(p.phase(),undefined);
  assert.equal(body.inert,false);assert.equal(p.animations.length,0);
  assert.equal(p.speeds.length,0);
});

test('late data starts the first card immediately without replaying chrome',()=>{
  const p=page(),root=p.root();p.window.WorkshopIntro.enter(root);p.step(2000);
  const chrome=p.animations.length;
  p.add(root,'.wk-grid > .wk-card','late-card');p.add(root,'.wk-grid > .wk-card','next-card');
  p.window.WorkshopIntro.refresh(root);
  p.step(2032);
  assert.equal(p.animations.length,chrome+2);assert.equal(p.animations[chrome].timing.delay,0);
  assert.ok(p.animations[chrome+1].timing.delay>0&&p.animations[chrome+1].timing.delay<=110);
  assert.equal(p.document.body.inert,false);
});

test('details reveal separate modules rather than fading their shared parent',()=>{
  const p=page(),root=p.root('detail');
  for(const selector of ['.wk-breadcrumb','.wk-gallery','.wk-config > h1','.wk-config > .wk-description','.wk-config-section','.wk-price-box, .wk-stock-facts','.wk-contact-button'])p.add(root,selector,selector);
  p.window.WorkshopIntro.enter(root);
  assert.ok(p.animations.some(a=>a.target.name==='.wk-gallery'));
  assert.ok(p.animations.some(a=>a.target.name==='.wk-config > h1'));
  assert.ok(p.animations.every(a=>a.target!==root&&a.target!==p.document.body));
  assert.ok(p.animations.every(a=>a.timing.delay+a.timing.duration<=1400));
});

test('repeated initialization never replays already visible modules',()=>{
  const p=page(),root=p.root('catalog',2);p.window.WorkshopIntro.enter(root);const count=p.animations.length;
  p.window.WorkshopIntro.enter(root);p.window.WorkshopIntro.refresh(root);p.step(1500);p.window.WorkshopIntro.enter(root);
  assert.equal(p.animations.length,count);assert.equal(p.window.WorkshopIntro.active(),false);
});

test('module initialization never interrupts the shared navigation warp',()=>{
  const p=page(),old=p.root('catalog',2);p.window.setWarpSpeed(40);p.window.WorkshopIntro.enter(old);
  assert.equal(p.window.WorkshopIntro.navigate('/prints/detail/?id=x','/prints/'),true);
  assert.ok(p.animations.every(a=>a.cancelled));
  const next=p.root('detail');p.add(next,'.wk-gallery','gallery');p.window.WorkshopIntro.enter(next);
  assert.ok(p.animations.some(a=>!a.cancelled&&a.target.name==='gallery'));
  assert.deepEqual(p.speeds,[['desktop',40]]);assert.equal(p.document.body.inert,false);
});

test('navigation away cancels only workshop animations and stale callbacks',()=>{
  const p=page(),root=p.root('catalog',2);p.window.WorkshopIntro.enter(root);
  assert.equal(p.window.WorkshopIntro.navigate('/archives/','/prints/'),false);
  p.add(root,'.wk-grid > .wk-card','abandoned');const count=p.animations.length;p.window.WorkshopIntro.refresh(root);
  assert.equal(p.animations.length,count);assert.ok(p.animations.every(a=>a.cancelled));
  assert.equal(p.phase(),undefined);assert.equal(p.document.documentElement.dataset.workshopEntry,undefined);
});

test('Swup body replacement preserves both existing input states',()=>{
  const p=page(),old=p.document.body;old.inert=true;
  p.window.WorkshopIntro.navigate('/prints/','/');p.document.body=new p.Element('new-body');
  p.window.WorkshopIntro.enter(p.root('catalog',1));p.step(1500);
  assert.equal(old.inert,true);assert.equal(p.document.body.inert,false);
});

test('reduced motion simplifies modules without controlling the shared background',()=>{
  const p=page({reduced:true}),root=p.root('catalog',4);p.window.WorkshopIntro.enter(root);
  assert.ok(p.animations.every(a=>a.timing.duration===260&&a.timing.delay<=180));
  assert.ok(p.animations.every(a=>a.keyframes.every(frame=>frame.transform===undefined)));
  assert.equal(p.speeds.length,0);assert.equal(p.document.body.inert,false);
  p.step(500);assert.equal(p.window.WorkshopIntro.active(),false);
});

test('mobile module lifecycle does not change the lightweight canvas speed',()=>{
  const p=page({mobile:true});p.window.WorkshopIntro.navigate('/prints/','/');p.window.WorkshopIntro.enter(p.root('catalog',1));p.step(800);
  assert.equal(p.speeds.length,0);
});

test('pagehide cleans effects and compositor hints',()=>{
  const p=page({path:'/prints/'});p.window.WorkshopIntro.enter(p.root('catalog',2));p.events.pagehide();
  assert.ok(p.animations.every(a=>a.cancelled&&!a.target.dataset.workshopReveal));
  assert.equal(p.phase(),undefined);assert.equal(p.window.WorkshopIntro.active(),false);
});

test('admin and unsupported animation APIs stay directly usable',()=>{
  const p=page(),admin=p.root('admin');p.window.WorkshopIntro.enter(admin);assert.equal(p.animations.length,0);
  const root=p.root('catalog',1);for(const nodes of root.groups.values())for(const node of nodes)node.animate=undefined;
  p.window.WorkshopIntro.enter(root);assert.equal(p.window.WorkshopIntro.active(),false);assert.equal(p.document.body.inert,false);
});

test('inline entrance styles contain no whole-page hiding rule',()=>{
  const styles=html.match(/<style id="workshop-intro-styles">([\s\S]*?)<\/style>/)?.[1];
  assert.ok(styles);assert.doesNotMatch(styles,/visibility:\s*hidden|pointer-events:\s*none|opacity:\s*0|body\s*>/);
});

test('effects start only after the first visible paint',()=>{
  const p=page();p.window.WorkshopIntro.enter(p.root('catalog',1));
  assert.ok(p.animations.every(a=>a.playState==='paused'&&a.currentTime===0));
  p.step(16);assert.ok(p.animations.every(a=>a.playState==='paused'));
  p.step(32);assert.ok(p.animations.every(a=>a.playState==='running'));
});

test('opening in the background does not consume the entrance',()=>{
  const p=page();p.document.visibilityState='hidden';p.window.WorkshopIntro.enter(p.root('catalog',1));p.step(2000);
  assert.ok(p.animations.every(a=>a.playState==='paused'&&a.currentTime===0));
  p.document.visibilityState='visible';p.events.visibilitychange();p.step(2032);
  assert.ok(p.animations.every(a=>a.playState==='running'&&a.currentTime===0));
  p.step(3500);assert.equal(p.window.WorkshopIntro.active(),false);
});

test('hiding midway pauses and showing resumes unfinished effects',()=>{
  const p=page();p.window.WorkshopIntro.enter(p.root('catalog',1));p.step(180);
  p.document.visibilityState='hidden';p.events.visibilitychange();const times=p.animations.map(a=>a.currentTime);p.step(1180);
  assert.deepEqual(p.animations.map(a=>a.currentTime),times);
  p.document.visibilityState='visible';p.events.visibilitychange();p.step(1212);
  assert.deepEqual(p.animations.map(a=>a.currentTime),times);
  p.step(2200);assert.equal(p.window.WorkshopIntro.active(),false);
});

test('a stale bootstrap is replaced instead of silently retaining its old behavior',()=>{
  let cancelled=false;const p=page({previous:{cancel(){cancelled=true;}}});
  assert.equal(cancelled,true);assert.equal(p.window.WorkshopIntro.version,'module-reveal-5');
  assert.equal(typeof p.window.WorkshopIntro.refresh,'function');
});

test('data arriving before the first visible frame cannot consume the module offsets',()=>{
  const p=page(),root=p.root();p.window.WorkshopIntro.enter(root);
  p.step(16);p.stall(500);p.add(root,'.wk-grid > .wk-card','cached-card');p.window.WorkshopIntro.refresh(root);p.step(516);
  const byName=name=>p.animations.find(a=>a.target.name===name);
  assert.equal(byName('brand').timing.delay,0);
  assert.equal(byName('back').timing.delay,160);
  assert.equal(byName('toolbar').timing.delay,300);
  assert.equal(byName('cached-card').timing.delay,480);
});

test('article and workshop visits share acceleration and decelerate while modules are active',()=>{
  const start=html.indexOf("swup.hooks.on('visit:start'");
  const end=html.indexOf("swup.hooks.on('page:view'",start);
  assert.ok(start>=0&&end>start);
  const hooks={},calls=[];
  vm.runInNewContext(html.slice(start,end),{
    swup:{hooks:{on:(name,fn)=>{hooks[name]=fn;}}},
    window:{WorkshopIntro:{navigate(){},active:()=>true},setWarpSpeed:value=>calls.push(value),setWarpSpeedSlow:()=>calls.push('slow')},
    document:{body:{classList:{add(){},remove(){}}}}
  });
  const run=url=>{calls.length=0;hooks['visit:start']({to:{url},from:{url:'/'}});hooks['visit:end']();return [...calls];};
  assert.deepEqual(run('/p/article/'),[40,'slow']);
  assert.deepEqual(run('/prints/'),[40,'slow']);
});

test('internal visits reveal details immediately and keep header modules still',()=>{
  const p=page(),root=p.root('detail');
  p.add(root,'.wk-gallery','gallery');p.add(root,'.wk-config > h1','title');
  p.window.WorkshopIntro.navigate('/prints/detail/?id=x','/prints/?tab=work');
  p.window.WorkshopIntro.enter(root);p.step(32);
  assert.ok(p.animations.length>0);
  assert.ok(p.animations.every(a=>a.target.name!=='brand'&&a.target.name!=='back'));
  for(const name of ['gallery','title']){
    const animation=p.animations.find(a=>a.target.name===name);
    assert.equal(animation.timing.delay,0);
    assert.ok(animation.timing.duration<=350);
  }
  p.step(600);assert.equal(p.window.WorkshopIntro.active(),false);
  p.window.WorkshopIntro.navigate('/prints/','/p/article/');
  p.window.WorkshopIntro.enter(p.root('catalog',1));
  assert.ok(p.animations.some(a=>!a.cancelled&&a.target.name==='brand'));
  assert.equal(p.animations.findLast(a=>a.target.name==='card0').timing.delay,480);
});

test('workshop returns and reduced motion keep fast navigation without stale state',()=>{
  const p=page({reduced:true});
  p.window.WorkshopIntro.navigate('/prints/?tab=product','/prints/detail/?id=x');
  p.window.WorkshopIntro.enter(p.root('catalog',1));p.step(32);
  assert.ok(p.animations.every(a=>a.target.name!=='brand'&&a.target.name!=='back'));
  assert.ok(p.animations.every(a=>a.keyframes.every(frame=>frame.transform===undefined)));
  p.window.WorkshopIntro.navigate('/prints/detail/?id=x','/prints/');
  p.window.WorkshopIntro.navigate('/prints/detail/?id=y','/');
  p.window.WorkshopIntro.enter(p.root('detail'));
  assert.ok(p.animations.some(a=>!a.cancelled&&a.target.name==='brand'));
});

test('only public workshop-to-workshop visits replace the smaller container',()=>{
  const start=html.indexOf("swup.hooks.on('visit:start'");
  const end=html.indexOf("swup.hooks.on('visit:end'",start);
  const hooks={},calls=[];let mounted=true;
  vm.runInNewContext(html.slice(start,end),{
    swup:{hooks:{on:(name,fn)=>{hooks[name]=fn;}}},
    window:{WorkshopIntro:{navigate(){}},destroyMobilePage:()=>calls.push('destroy-mobile')},
    document:{querySelector:()=>mounted?{}:null,body:{classList:{remove:()=>calls.push('remove-loaded')}}}
  });
  const run=(from,to)=>{calls.length=0;const visit={from:{url:from},to:{url:to}};hooks['visit:start'](visit);return visit;};
  for(const [from,to] of [['/prints/?tab=work','/prints/detail/?id=x'],['/prints/detail/?id=x','/prints/?tab=product']]){
    assert.deepEqual(Array.from(run(from,to).containers),['[data-workshop]']);assert.deepEqual(calls,[]);
  }
  for(const [from,to] of [['/','/prints/'],['/prints/','/p/article/'],['/prints/admin/','/prints/']]){
    assert.equal(run(from,to).containers,undefined);assert.deepEqual(calls,['destroy-mobile','remove-loaded']);
  }
  mounted=false;assert.equal(run('/prints/','/prints/detail/?id=x').containers,undefined);
});
