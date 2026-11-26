const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {execFileSync} = require('node:child_process');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.argv[2] || 'http://127.0.0.1:13136';
const out = process.argv[3] || '.local/print-workshop/qa/cleanup';
fs.mkdirSync(out, {recursive:true});
const catalog = JSON.parse(fs.readFileSync(process.env.WORKSHOP_QA_CATALOG || '.local/print-workshop/qa-site/workshop/catalog.json','utf8'));
const work = catalog.entries.find(entry=>entry.kind==='work' && entry.name==='扭纹花器');
const product = catalog.entries.find(entry=>entry.kind==='product' && entry.name==='青绿扭纹花器');
const forbidden = /SMALL OBJECTS|让想象|DESIGNED WITH CARE|用心设计|FORM & EXPLORATION|MADE FOR YOUR EVERYDAY|演示内容|示例价|DEMO|A WORKSHOP JOURNAL|MAKE IT YOURS|点击缩略图|点击播放，查看/;
const results = [];
const device = mobile=>mobile ? {viewport:{width:390,height:844},isMobile:true,hasTouch:true,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'} : {viewport:{width:1440,height:1000}};

async function setup(browser, mobile, reduced='no-preference') {
  const page = await browser.newPage({...device(mobile),reducedMotion:reduced});
  page.setDefaultTimeout(15000);
  const errors=[],requests=[];
  page.on('pageerror',error=>errors.push(error.message));
  page.on('request',request=>requests.push(request.url()));
  await page.route('https://**',route=>route.abort());
  await page.addInitScript(()=>{
    window.__qaSpeeds=[];
    window.__qaSlows=[];
    window.__qaModules=[];
    window.__qaEffects=[];
    const animate=Element.prototype.animate;
    Element.prototype.animate=function(keyframes,options){
      const animation=animate.call(this,keyframes,options);
      if(this.closest('[data-workshop]')){
        window.__qaModules.push({target:this.className,tag:this.tagName,keyframes,options,at:performance.now(),inert:document.body.inert});
        window.__qaEffects.push({target:this.className,animation});
      }
      return animation;
    };
    function record(fn) {return function(value){window.__qaSpeeds.push({time:performance.now(),speed:value,phase:document.documentElement.dataset.workshopIntro});return fn(value);};}
    let desktop;
    Object.defineProperty(window,'setWarpSpeed',{configurable:true,get:()=>desktop,set:fn=>{desktop=record(fn);}});
    let slow;
    Object.defineProperty(window,'setWarpSpeedSlow',{configurable:true,get:()=>slow,set:fn=>{slow=function(){window.__qaSlows.push({time:performance.now(),modulesActive:!!window.WorkshopIntro?.active()});return fn();};}});
    let mobile;
    Object.defineProperty(window,'__mobileWarp',{configurable:true,get:()=>mobile,set:engine=>{mobile=engine;engine.setSpeed=record(engine.setSpeed);}});
  });
  return {page,errors,requests};
}
const ready = page=>page.waitForFunction(()=>window.WorkshopApp && !window.WorkshopIntro.active() && document.querySelector('[data-workshop-item],.wk-detail-grid'));
const state = page=>page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,inert:document.body.inert,phase:document.documentElement.dataset.workshopIntro,selected:document.querySelector('[data-view].is-active')?.dataset.view,order:[...document.querySelectorAll('[data-view]')].map(el=>el.dataset.view),text:document.querySelector('[data-workshop]')?.innerText}));
async function galleryFrame(page) {
  const frame=await page.locator('.wk-stage').evaluate(stage=>{
    const media=stage.querySelector('img:not([hidden]),video:not([hidden]),model-viewer:not([hidden])');
    const box=stage.getBoundingClientRect(),content=media.getBoundingClientRect();
    return {type:media.tagName.toLowerCase(),width:box.width,height:box.height,mediaWidth:content.width,mediaHeight:content.height,toolsTop:stage.nextElementSibling.getBoundingClientRect().top+scrollY,fit:getComputedStyle(media).objectFit};
  });
  if(await page.locator('html').getAttribute('data-ui')==='mobile'){
    assert.ok(frame.height>=180&&frame.height<=300,'mobile gallery must leave room for configuration');
  }else assert.ok(Math.abs(frame.width-frame.height)<0.1,'desktop gallery must stay square');
  assert.ok(Math.abs(frame.width-frame.mediaWidth)<0.1&&Math.abs(frame.height-frame.mediaHeight)<0.1,'each medium must fill the same frame');
  if(frame.type!=='model-viewer')assert.equal(frame.fit,'contain');
  return frame;
}
function sameFrames(frames) {
  for(const frame of frames)for(const key of ['width','height','toolsTop'])assert.ok(Math.abs(frame[key]-frames[0][key])<0.1,`${key} must stay stable when switching media`);
}
async function automaticVideoState(page) {
  await page.waitForFunction(()=>{const video=document.querySelector('[data-stage-video]');return video&&video.currentTime>0&&video.played.length>0;});
  const playback=await page.locator('[data-stage-video]').evaluate(video=>({autoplay:video.autoplay,muted:video.muted,playsInline:video.playsInline,controls:video.controls,time:video.currentTime,duration:video.duration,paused:video.paused,ended:video.ended}));
  assert.equal(playback.autoplay,true);assert.equal(playback.playsInline,true);
  assert.equal(playback.controls,(await page.locator('html').getAttribute('data-ui'))!=='mobile');
  return playback;
}

async function restartVideoFromButton(page,index,playing=false) {
  const video=page.locator('[data-stage-video]');
  await page.waitForFunction(()=>document.querySelector('[data-stage-video]').readyState>=2);
  await video.evaluate(async video=>{video.currentTime=0;await video.play();});
  await page.waitForFunction(()=>{const video=document.querySelector('[data-stage-video]');return video.currentTime>=video.duration*0.65&&!video.ended;});
  if(!playing)await video.evaluate(video=>video.pause());
  await page.locator(`[data-view="video"][data-media-index="${index}"]`).click();
  await page.waitForFunction(()=>{const video=document.querySelector('[data-stage-video]');return video.readyState>=2&&!video.seeking;});
  const playback=await video.evaluate(video=>({time:video.currentTime,duration:video.duration,paused:video.paused,ended:video.ended,hidden:video.hidden}));
  assert.equal(playback.paused,false);assert.equal(playback.ended,false);assert.equal(playback.hidden,false);
  assert.ok(playback.time<playback.duration/2,'video button must restart from the beginning: '+JSON.stringify(playback));
  await page.waitForFunction(()=>{const video=document.querySelector('[data-stage-video]');return !video.paused&&video.currentTime>0;});
  return playback;
}

async function swipeStage(page,direction,{edge=false,vertical=false,short=false,cancel=false,controls=false}={}) {
  const box=await page.locator('.wk-stage').boundingBox();
  const from={x:edge?box.x+(direction==='right'?14:box.width-14):box.x+box.width/2,y:box.y+(controls?box.height-20:box.height/2)};
  const distance=short?16:Math.min(140,box.width*.4);
  const to={x:from.x+(vertical?0:direction==='left'?-distance:distance),y:from.y-(vertical?90:0)};
  const cdp=await page.context().newCDPSession(page);
  try{
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[from]});
    for(let step=1;step<=8;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:from.x+(to.x-from.x)*step/8,y:from.y+(to.y-from.y)*step/8}]});
    await cdp.send('Input.dispatchTouchEvent',{type:cancel?'touchCancel':'touchEnd',touchPoints:[]});
    await page.waitForFunction(()=>!document.querySelector('.wk-stage')?.classList.contains('is-swiping'));
  }finally{await cdp.detach();}
}

(async()=>{
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
  try {
    for(const mobile of [false,true]) {
      const label=mobile?'mobile':'desktop';
      const {page,errors,requests}=await setup(browser,mobile);
      await page.goto(base+'/prints/',{waitUntil:'load'});await ready(page);
      assert.doesNotMatch((await state(page)).text,forbidden);
      await page.screenshot({path:path.join(out,label+'-catalog.png'),fullPage:true});
      await page.evaluate(()=>{window.__qaSpeeds=[];window.__qaSlows=[];});
      await page.locator(`.wk-card[href$="id=${work.id}"]`).click();await page.waitForFunction(()=>location.pathname==='/prints/detail/'&&document.querySelector('.wk-detail-grid'));await ready(page);
      assert.deepEqual(await page.evaluate(()=>window.__qaSpeeds.map(sample=>sample.speed)),[40]);
      assert.equal(await page.evaluate(()=>window.__qaSlows.length),1);
      assert.equal((await state(page)).selected,work.videos.length?'video':'photo');
      assert.deepEqual((await state(page)).order,work.videos.length?['video','photo','photo','model']:['photo','photo','model']);
      assert.equal(await page.locator('.wk-thumbnails,[data-thumbnail],[data-video-thumbnail]').count(),0);
      assert.equal(await page.locator('[data-viewer]').getAttribute('src'),null);
      assert.equal(requests.filter(url=>/model-viewer.*\.js|\.glb/.test(url)).length,0);
      const frames=[await galleryFrame(page)];
      const autoplay=[];
      if(work.videos.length){
        autoplay.push({kind:'work',...await automaticVideoState(page)});
        await page.screenshot({path:path.join(out,label+'-work-video.png'),fullPage:true});
        await page.locator('[data-view="photo"]').first().click();
        assert.equal(await page.locator('[data-stage-video]').evaluate(video=>video.paused),true);
      }
      assert.ok(await page.locator('[data-stage-image]').isVisible());
      frames.push(await galleryFrame(page));
      assert.ok(await page.locator('[data-color-id]').count()>0);
      assert.equal(await page.locator('[data-material]').innerText(),work.colors[0].material);
      assert.equal(await page.locator('.wk-config h1').innerText(),work.name);
      assert.equal(await page.locator('.wk-description').innerText(),work.description);
      assert.equal(await page.locator('[data-infill-number], .wk-range-labels, [data-selection-summary]').count(),0);
      const slider=page.locator('[data-infill-range]');
      await slider.press('Home');
      assert.equal(await page.locator('[data-infill-value]').innerText(),'15%');
      assert.equal(await page.locator('[data-weight]').innerText(),'60 g');
      await slider.press('ArrowLeft');
      assert.equal(await slider.inputValue(),'15');
      await slider.press('End');
      assert.equal(await page.locator('[data-infill-value]').innerText(),'100%');
      assert.equal(await page.locator('[data-weight]').innerText(),'180 g');
      await slider.press('ArrowRight');
      assert.equal(await slider.inputValue(),'100');
      await slider.press('ArrowLeft');
      assert.equal(await page.locator('[data-infill-value]').innerText(),'99%');
      await slider.evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input',{bubbles:true}));});
      assert.equal(await page.locator('[data-contact]').isEnabled(),true);
      assert.equal(await page.locator('[data-price]').innerText(),'¥53');
      assert.equal(await page.locator('[data-weight]').innerText(),'109.41 g');
      assert.equal(await page.locator('[data-view="photo"]').count(),2);
      assert.equal(await page.locator('[data-view="photo"][data-media-index="0"]').innerText(),'▧ 图片1');
      assert.equal(await page.locator('[data-view="photo"][data-media-index="1"]').innerText(),'▧ 图片2');
      await page.locator('[data-view="photo"][data-media-index="1"]').click();
      await page.waitForFunction(url=>document.querySelector('[data-stage-image]')?.getAttribute('src')===url,work.images[1].url);
      assert.equal(await page.locator('[data-view="photo"][data-media-index="1"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-view][aria-pressed="true"]').count(),1);
      frames.push(await galleryFrame(page));
      const weightCurve=await slider.evaluate(input=>Array.from({length:86},(_,index)=>{
        const fill=index+15;input.value=String(fill);input.dispatchEvent(new Event('input',{bubbles:true}));
        return {fill,weight:document.querySelector('[data-weight]').textContent,percent:document.querySelector('[data-infill-value]').textContent,aria:input.getAttribute('aria-valuetext'),url:new URLSearchParams(location.search).get('infill')};
      }));
      for(const sample of weightCurve){
        assert.equal(sample.weight,`${(Math.round((60+120*(sample.fill-15)/85)*100)/100).toLocaleString('zh-CN',{maximumFractionDigits:2})} g`);
        assert.equal(sample.percent,`${sample.fill}%`);assert.equal(sample.aria,sample.percent);assert.equal(sample.url,String(sample.fill));
      }
      await slider.evaluate(input=>{input.value='50';input.dispatchEvent(new Event('input',{bubbles:true}));});
      await page.locator('[data-contact]').click();await page.locator('[data-contact-dialog]').waitFor({state:'visible'});
      const customList=await page.locator('[data-contact-text]').inputValue();
      assert.match(customList,/颜色：/);assert.match(customList,/填充比例：50%/);
      assert.deepEqual(customList.split('\n').map(line=>line.split('：')[0]),['商品','材质','颜色','填充比例','报价']);
      assert.ok(customList.includes('材质：'+work.colors[0].material));
      assert.doesNotMatch(customList,/演示|示例/);
      await page.locator('[data-close-dialog]').click();
      await page.locator('[data-view="model"]').click();
      await page.waitForFunction(()=>document.querySelector('[data-viewer]')?.model);
      assert.ok(await page.locator('[data-viewer]').evaluate(viewer=>viewer.getBoundingClientRect().height>50));
      frames.push(await galleryFrame(page));sameFrames(frames);
      await page.screenshot({path:path.join(out,label+'-work-model.png'),fullPage:true});
      await page.locator('[data-color-id]').nth(1).click();
      await page.locator('[data-reset-view]').click();
      await page.locator('[data-view="photo"]').first().click();
      assert.equal(await page.locator('[data-reset-view]').isVisible(),false);
      assert.equal(await page.locator('[data-viewer-loading]').isVisible(),false);
      assert.doesNotMatch((await state(page)).text,forbidden);
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(out,label+'-work.png'),fullPage:true});
      await page.goto(base+'/prints/?tab=product',{waitUntil:'load'});await ready(page);
      assert.doesNotMatch((await state(page)).text,forbidden);
      const productCard=page.locator(`.wk-card[href$="id=${product.id}"]`);
      const cardText=await productCard.innerText();
      assert.match(cardText,/¥39/);assert.match(cardText,/120 g/);assert.doesNotMatch(cardText,/起/);
      await productCard.click();await page.waitForFunction(()=>location.pathname==='/prints/detail/'&&document.querySelector('.wk-detail-grid'));await ready(page);
      assert.equal(await page.locator('[data-color-id], [data-infill-number], [data-infill-range]').count(),0);
      assert.equal(await page.locator('.wk-config h1').innerText(),product.name);
      assert.equal(await page.locator('.wk-description').innerText(),product.description);
      assert.equal(await page.locator('[data-price]').innerText(),'¥39');
      assert.equal(await page.locator('[data-weight]').innerText(),'120 g');
      assert.equal(await page.locator('[data-material]').innerText(),product.material);
      const stockFrames=[await galleryFrame(page)];
      assert.equal((await state(page)).selected,product.videos.length?'video':'photo');
      if(product.videos.length){
        autoplay.push({kind:'product',...await automaticVideoState(page)});
        await page.locator('[data-view="photo"]').first().click();
        assert.equal(await page.locator('[data-stage-video]').evaluate(video=>video.paused),true);
        stockFrames.push(await galleryFrame(page));
      }
      if(product.model){
        await page.locator('[data-view="model"]').click();
        await page.waitForFunction(()=>document.querySelector('[data-viewer]')?.model);
        stockFrames.push(await galleryFrame(page));
        await page.locator('[data-view="photo"]').first().click();
      }
      sameFrames(stockFrames);
      await page.locator('[data-contact]').click();await page.locator('[data-contact-dialog]').waitFor({state:'visible'});
      const stockList=await page.locator('[data-contact-text]').inputValue();
      assert.match(stockList,/报价：¥39/);
      assert.deepEqual(stockList.split('\n').map(line=>line.split('：')[0]),['商品','材质','报价']);
      assert.ok(stockList.includes('材质：'+product.material));
      assert.doesNotMatch(stockList,/颜色：|填充比例：|演示|示例/);
      await page.locator('[data-close-dialog]').click();
      assert.doesNotMatch((await state(page)).text,forbidden);
      await page.evaluate(()=>scrollTo(0,0));
      await page.screenshot({path:path.join(out,label+'-product.png'),fullPage:true});
      const final=await state(page);
      assert.ok(final.scrollWidth<=final.width);
      assert.equal(final.inert,false);assert.deepEqual(errors,[]);
      results.push({case:label+' catalog, work, product, lazy 3D, colors and quote',autoplay,frames,stockFrames,...final,errors});
      await page.close();
    }
    for(const mobile of [false,true])for(const reduced of ['no-preference','reduce']) {
      const {page,errors}=await setup(browser,mobile,reduced);
      await page.goto(base+'/',{waitUntil:'load'});
      await page.waitForFunction(()=>window.swup && window.WorkshopIntro);
      const firstPage = mobile ? '.m-home-track [data-mobile-page="1"]' : 'main > [data-page="1"]';
      const articleLink=page.locator(firstPage+' article:not(.home-pinned-card) .article-image a').first();
      await page.evaluate(()=>{window.__qaSpeeds=[];window.__qaSlows=[];});
      await articleLink.click();
      await page.waitForFunction(()=>document.querySelector('article.main-article')&&window.__qaSlows.length>0);
      const articleWarp=await page.evaluate(()=>({speeds:window.__qaSpeeds.map(sample=>sample.speed),slow:window.__qaSlows.length}));
      assert.deepEqual(articleWarp,{speeds:[40],slow:1});
      await page.goBack();
      const link=page.locator(firstPage+' article:first-child .article-image a[href$="/prints/"]');
      await link.waitFor();
      await page.evaluate(()=>{window.__qaSpeeds=[];window.__qaSlows=[];window.__qaModules=[];window.__qaEffects=[];window.__qaDocument=document;});
      await link.click();await ready(page);
      const speeds=await page.evaluate(()=>window.__qaSpeeds);
      const workshopWarp=await page.evaluate(()=>({speeds:window.__qaSpeeds.map(sample=>sample.speed),slow:window.__qaSlows.length}));
      assert.deepEqual(workshopWarp,articleWarp);
      const modules=await page.evaluate(()=>window.__qaModules);
      assert.ok(modules.some(module=>module.target.includes('wk-card')));
      assert.ok(modules.some(module=>module.target.includes('wk-brand')));
      assert.ok(modules.some(module=>module.target.includes('wk-nav-back')));
      assert.ok(modules.some(module=>module.target.includes('wk-collection-toolbar')));
      assert.ok(modules.every(module=>module.inert===false&&module.options.duration+module.options.delay<=1400));
      assert.ok(modules.every(module=>module.tag!=='BODY'&&module.target!=='wk-grid'));
      if(reduced==='reduce')assert.ok(modules.every(module=>module.options.delay<=180&&module.keyframes.every(frame=>!frame.transform)));
      assert.equal(await page.evaluate(()=>document===window.__qaDocument),true,'navigation should use actual Swup body replacement');
      assert.equal((await state(page)).inert,false);
      assert.deepEqual(errors,[]);
      results.push({case:(mobile?'mobile':'desktop')+' article and workshop share warp '+reduced,articleWarp,workshopWarp,modules,speeds,errors});
      await page.close();
    }
    {
      const {page,errors}=await setup(browser,false);
      await page.goto(base+'/',{waitUntil:'load'});await page.waitForFunction(()=>window.swup&&window.WorkshopIntro);
      let release;
      const held=new Promise(resolve=>{release=resolve;});
      await page.route('**/prints/?qa-delayed=1',async route=>{await held;await route.continue();});
      const link=page.locator('main > [data-page="1"] .home-pinned-card .article-image a');
      await link.evaluate(el=>{el.href='/prints/?qa-delayed=1';});
      await page.evaluate(()=>{window.__qaSpeeds=[];window.__qaSlows=[];});
      await link.click();await page.waitForTimeout(1200);
      const waiting=await page.evaluate(()=>({speed:window.__qaSpeeds.at(-1).speed,phase:document.documentElement.dataset.workshopIntro,inert:document.body.inert,opacity:getComputedStyle(document.body).opacity}));
      assert.equal(waiting.speed,40);assert.equal(waiting.phase,undefined);assert.equal(waiting.inert,false);assert.equal(waiting.opacity,'1');
      const boundary=await page.evaluate(()=>window.__qaSpeeds.length);
      release();await ready(page);
      const after=await page.evaluate(index=>window.__qaSpeeds.slice(index),boundary);
      assert.equal(await page.evaluate(()=>window.__qaSlows.length),1);assert.deepEqual(errors,[]);
      results.push({case:'slow HTML navigation leaves the old page visible and usable',waiting,after,errors});await page.close();
    }
    for(const mobile of [false,true]){
      const {page,errors}=await setup(browser,mobile);
      let release;const held=new Promise(resolve=>{release=resolve;});
      await page.route('**/workshop/catalog.json',async route=>{await held;await route.fulfill({json:catalog});});
      await page.goto(base+'/prints/',{waitUntil:'domcontentloaded'});
      await page.locator('.wk-collection-toolbar').waitFor({state:'visible'});
      await page.waitForFunction(()=>!window.WorkshopIntro.active());
      assert.equal(await page.locator('[data-workshop-item]').count(),0);
      await page.locator('[data-catalog-lead="work"]').waitFor({state:'visible'});
      await page.locator('.wk-topic-card').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-catalog-tab="product"]').isEnabled(),true);
      assert.equal((await state(page)).inert,false);
      assert.equal(await page.locator('.wk-collection-toolbar').evaluate(node=>getComputedStyle(node).opacity),'1');
      const earlyEffects=await page.evaluate(()=>window.__qaEffects.length);
      release();await ready(page);
      const modules=await page.evaluate(()=>window.__qaModules);
      const lateDelay=await page.evaluate(index=>window.__qaEffects.slice(index)
        .find(item=>item.target==='wk-card')?.animation.effect.getTiming().delay,earlyEffects);
      if (lateDelay!==undefined) assert.equal(lateDelay,0);
      assert.equal((await page.evaluate(()=>window.__qaSpeeds)).length,0);
      assert.deepEqual(errors,[]);
      results.push({case:(mobile?'mobile':'desktop')+' late cards appear immediately after usable navigation',modules,errors});
      await page.close();
    }
    {
      const videoFile=process.env.WORKSHOP_QA_VIDEO || path.join(out,'gallery-fixture.webm');
      if(!fs.existsSync(videoFile))execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x240:rate=24','-t','1','-an','-c:v','libvpx-vp9','-y',videoFile]);
      for(const mobile of [false,true])for(const kind of ['work','product']) {
        const {page,errors,requests}=await setup(browser,mobile);
        const fixture=structuredClone(catalog);
        const item=fixture.entries.find(entry=>entry.id===(kind==='work'?work.id:product.id));
        if(kind==='work'){item.colors[0].material='PLA';item.colors[1].material='PETG';}else item.material='TPU';
        if(kind==='product')item.model=null;
        item.videos=[1,2].map(index=>({id:'qa-video-'+index,name:'QA video '+index,url:'/__qa/video-'+index+'.webm',kind:'video',size:fs.statSync(videoFile).size}));
        item.images=[item.images[0],{...item.images[0],url:item.images[0].url+'?qa-image=2'}];
        await page.route('**/workshop/catalog.json',route=>route.fulfill({json:fixture}));
        await page.route('**/__qa/*.webm',route=>route.fulfill({body:fs.readFileSync(videoFile),contentType:'video/webm'}));
        await page.goto(base+'/prints/detail/?id='+item.id,{waitUntil:'load'});await ready(page);
        assert.deepEqual((await state(page)).order,kind==='work'?['video','video','photo','photo','model']:['video','video','photo','photo']);
        assert.equal((await state(page)).selected,'video');
        assert.ok(await page.locator('[data-stage-video]').isVisible());
        const frames=[await galleryFrame(page)];
        assert.equal(await page.locator('.wk-thumbnails,[data-thumbnail],[data-video-thumbnail]').count(),0);
        const labels=await page.locator('[data-view]').allInnerTexts();
        assert.deepEqual(labels,kind==='work'?['▷ 视频1','▷ 视频2','▧ 图片1','▧ 图片2','◇ 3D 预览']:['▷ 视频1','▷ 视频2','▧ 图片1','▧ 图片2']);
        assert.equal(requests.filter(url=>/model-viewer.*\.js|\.glb/.test(url)).length,0);
        const autoplay=await automaticVideoState(page);
        const restarts=[await restartVideoFromButton(page,0)];
        await page.locator('[data-stage-video]').evaluate(async video=>{video.currentTime=video.duration-0.05;await video.play();});
        await page.waitForFunction(()=>document.querySelector('[data-stage-video]').ended);
        if(mobile)assert.ok(await page.locator('[data-video-replay]').isVisible());
        await page.locator('[data-view="video"][data-media-index="0"]').click();
        if(mobile)assert.equal(await page.locator('[data-video-replay]').isVisible(),false);
        assert.equal(await page.locator('[data-stage-video]').evaluate(video=>video.paused||video.ended),false);
        assert.ok(await page.locator('[data-stage-video]').evaluate(video=>video.currentTime<video.duration/2));
        await page.locator('[data-stage-video]').evaluate(async video=>{video.currentTime=0;await video.play();});
        await page.waitForFunction(()=>document.querySelector('[data-stage-video]').currentTime>0);
        await page.locator('[data-view="photo"]').first().click();
        frames.push(await galleryFrame(page));
        assert.equal(await page.locator('[data-stage-video]').evaluate(video=>video.paused),true);
        restarts.push(await restartVideoFromButton(page,1));
        assert.ok((await page.locator('[data-stage-video]').getAttribute('src')).endsWith('video-2.webm'));
        assert.equal(await page.locator('[data-view="video"][data-media-index="1"]').getAttribute('aria-pressed'),'true');
        restarts.push(await restartVideoFromButton(page,1,true));
        await page.locator('[data-view="photo"][data-media-index="1"]').click();
        await page.waitForFunction(url=>document.querySelector('[data-stage-image]')?.getAttribute('src')===url,item.images[1].url);
        assert.equal(await page.locator('[data-view="photo"][data-media-index="1"]').getAttribute('aria-pressed'),'true');
        assert.equal(await page.locator('[data-view][aria-pressed="true"]').count(),1);
        restarts.push(await restartVideoFromButton(page,1));
        if(kind==='work'){
          assert.equal(await page.locator('[data-material]').innerText(),'PLA');
          await page.locator('[data-color-id]').nth(1).click();
          assert.equal(await page.locator('[data-material]').innerText(),'PETG');
          assert.equal((await state(page)).selected,'model');
          await page.waitForFunction(()=>document.querySelector('[data-viewer]')?.model);
          restarts.push(await restartVideoFromButton(page,1));
        }else assert.equal(await page.locator('[data-material]').innerText(),'TPU');
        await page.locator('[data-contact]').click();await page.locator('[data-contact-dialog]').waitFor({state:'visible'});
        assert.ok((await page.locator('[data-contact-text]').inputValue()).includes('材质：'+(kind==='work'?'PETG':'TPU')));
        await page.locator('[data-close-dialog]').click();
        assert.ok((await state(page)).scrollWidth<=(await state(page)).width);
        frames.push(await galleryFrame(page));sameFrames(frames);
        await page.screenshot({path:path.join(out,(mobile?'mobile':'desktop')+'-'+kind+'-gallery-video-fixture.png'),fullPage:true});
        assert.deepEqual(errors,[]);results.push({case:(mobile?'mobile':'desktop')+' '+kind+' numbered media buttons, restart playback and pause',autoplay,restarts,labels,frames,...await state(page),errors});await page.close();
      }
    }
    {
      const {page,errors,requests}=await setup(browser,false);
      const fixture=structuredClone(catalog);fixture.entries.forEach(entry=>entry.videos=[]);
      await page.route('**/workshop/catalog.json',route=>route.fulfill({json:fixture}));
      await page.goto(base+'/prints/detail/?id='+work.id,{waitUntil:'load'});await ready(page);
      assert.equal(await page.locator('[data-stage-video]').count(),0);
      assert.equal((await state(page)).selected,'photo');assert.deepEqual((await state(page)).order,['photo','photo','model']);
      assert.equal(requests.filter(url=>/model-viewer.*\.js|\.glb/.test(url)).length,0);
      const frame=await galleryFrame(page);assert.deepEqual(errors,[]);
      results.push({case:'photo-first fallback without video',frame,errors});await page.close();
    }
    for(const mobile of [false,true])for(const hasModel of [true,false]){
      const {page,errors,requests}=await setup(browser,mobile);
      const fixture=structuredClone(catalog),item=fixture.entries.find(entry=>entry.id===work.id);
      if(!hasModel)item.model=null;
      await page.route('**/workshop/catalog.json',route=>route.fulfill({json:fixture}));
      let releaseModel;
      const heldModel=new Promise(resolve=>{releaseModel=resolve;});
      if(hasModel)await page.route(new URL(item.model.url,base).href,async route=>{await heldModel;await route.continue();});
      await page.goto(base+'/prints/detail/?id='+item.id,{waitUntil:'load'});await ready(page);
      assert.equal((await state(page)).selected,'video');
      await page.locator('[data-color-id]').nth(1).click();
      assert.equal((await state(page)).selected,hasModel?'model':'video');
      assert.equal(await page.locator('[data-color-name]').innerText(),item.colors[1].name);
      if(hasModel){
        assert.ok(await page.locator('[data-viewer]').isVisible());
        assert.ok(await page.locator('[data-viewer-loading]').isVisible());
        assert.equal(await page.locator('[data-stage-video]').evaluate(video=>video.paused),true);
        // A second choice while loading must become the model's final color.
        await page.locator('[data-color-id]').nth(3).click();
        releaseModel();
        await page.waitForFunction(()=>document.querySelector('[data-viewer]')?.model);
        const factors=()=>page.locator('[data-viewer]').evaluate(viewer=>viewer.model.materials.map(material=>Array.from(material.pbrMetallicRoughness.baseColorFactor)));
        const orange=await factors();
        assert.ok(orange.length>0);
        assert.ok(orange.every(rgba=>rgba[0]>rgba[1]&&rgba[1]>rgba[2]),'pending orange selection should tint every material');
        await page.locator('[data-view="photo"]').first().click();
        await page.locator('[data-color-id]').nth(4).click();
        assert.equal((await state(page)).selected,'model');
        const blue=await factors();
        assert.notDeepEqual(blue,orange);
        assert.ok(blue.every(rgba=>rgba[2]>rgba[1]&&rgba[1]>rgba[0]),'new blue selection should recolor the loaded model');
        await page.locator('[data-view="video"]').first().click();
        await page.locator('[data-color-id]').nth(4).click();
        assert.equal((await state(page)).selected,'model','clicking the current color should also open 3D');
        assert.equal(await page.locator('[data-view][aria-pressed="true"]').count(),1);
        await page.screenshot({path:path.join(out,(mobile?'mobile':'desktop')+'-color-opens-model.png'),fullPage:true});
      }
      await page.locator('[data-view="photo"]').first().click();
      await page.locator('[data-infill-range]').press('ArrowRight');
      assert.equal((await state(page)).selected,'photo','infill changes should keep the current medium');
      if(!hasModel){
        await page.locator('[data-color-id]').nth(2).click();
        assert.equal((await state(page)).selected,'photo');
        assert.equal(requests.filter(url=>/model-viewer.*\.js|\.glb/.test(url)).length,0);
      }
      assert.deepEqual(errors,[]);
      results.push({case:(mobile?'mobile':'desktop')+' color choice '+(hasModel?'opens 3D immediately and recolors':'keeps media without a model'),...await state(page),errors});
      await page.close();
    }
    for(const mobile of [false,true]){
      const {page,errors}=await setup(browser,mobile);
      const videoFile=process.env.WORKSHOP_QA_VIDEO || path.join(out,'gallery-fixture.webm');
      let release;const held=new Promise(resolve=>{release=resolve;});
      await page.route(new URL(work.videos[0].url,base).href,async route=>{await held;await route.fulfill({body:fs.readFileSync(videoFile),contentType:'video/webm'});});
      await page.goto(base+'/prints/detail/?id='+work.id,{waitUntil:'domcontentloaded'});await ready(page);
      await page.locator('[data-view="photo"]').first().click();release();
      await page.waitForFunction(()=>document.querySelector('[data-stage-video]').readyState>=2);
      await page.waitForTimeout(250);
      const playback=await page.locator('[data-stage-video]').evaluate(video=>({paused:video.paused,time:video.currentTime,hidden:video.hidden}));
      assert.deepEqual(playback,{paused:true,time:0,hidden:true});assert.deepEqual(errors,[]);
      results.push({case:(mobile?'mobile':'desktop')+' early photo switch cancels pending autoplay',playback,errors});await page.close();
    }
    {
      const {page,errors}=await setup(browser,true);
      const fixture=structuredClone(catalog),item=fixture.entries.find(entry=>entry.id===work.id);
      item.videos=Array.from({length:6},(_,index)=>({...work.videos[0],url:work.videos[0].url+'?qa-video='+index}));
      item.images=Array.from({length:12},(_,index)=>({...work.images[0],url:work.images[0].url+'?qa-image='+index}));
      await page.route('**/workshop/catalog.json',route=>route.fulfill({json:fixture}));
      await page.goto(base+'/prints/detail/?id='+item.id,{waitUntil:'load'});await ready(page);
      const buttons=page.locator('[data-view]');assert.equal(await buttons.count(),19);
      const layout=await buttons.evaluateAll(elements=>elements.map(element=>{const rect=element.getBoundingClientRect();return {text:element.textContent.trim(),x:rect.x,width:rect.width,top:rect.top,height:rect.height};}));
      assert.ok(new Set(layout.map(button=>button.top)).size>1,'many mobile media buttons wrap into visible rows');
      const strip=await page.locator('.wk-view-switch').evaluate(element=>{
        const rect=element.getBoundingClientRect();return {width:rect.width,scrollWidth:element.scrollWidth,x:rect.x};
      });
      assert.ok(strip.scrollWidth<=strip.width+1,'media choices must not require horizontal scrolling');
      assert.ok(layout.every(button=>button.top>=0&&button.top+button.height<=844),'all 19 media choices fit in the initial phone viewport');
      assert.ok(strip.x>=0&&strip.x+strip.width<=390);
      for(const button of await buttons.all()){
        await button.scrollIntoViewIfNeeded();
        const box=await button.boundingBox();
        assert.ok(box.width>0&&box.x>=0&&box.x+box.width<=390,'each media button remains reachable');
      }
      assert.equal(layout[5].text,'▷ 视频6');assert.equal(layout[17].text,'▧ 图片12');
      await page.locator('[data-view="video"][data-media-index="5"]').click();
      assert.ok((await page.locator('[data-stage-video]').getAttribute('src')).endsWith('?qa-video=5'));
      await page.locator('[data-view="photo"][data-media-index="11"]').click();
      await page.waitForFunction(url=>document.querySelector('[data-stage-image]')?.getAttribute('src')===url,item.images[11].url);
      assert.equal(await page.locator('[data-view][aria-pressed="true"]').count(),1);
      assert.equal(await page.locator('.wk-thumbnails').count(),0);
      assert.ok((await state(page)).scrollWidth<=390);assert.deepEqual(errors,[]);
      await page.screenshot({path:path.join(out,'mobile-all-media-buttons.png'),fullPage:true});
      results.push({case:'mobile all 19 media buttons wrap without horizontal scrolling and remain selectable',layout,strip,errors});await page.close();
    }
    for(const item of [work,product]){
      const {page,errors,requests}=await setup(browser,true);
      await page.goto(base+'/prints/detail/?id='+item.id,{waitUntil:'load'});await ready(page);
      const selected=()=>page.locator('[data-view][aria-pressed="true"]').evaluate(button=>({view:button.dataset.view,index:Number(button.dataset.mediaIndex||0)}));
      const frames=[await galleryFrame(page)];
      await swipeStage(page,'left',{short:true});assert.equal((await selected()).view,'video');
      await swipeStage(page,'left',{cancel:true});assert.equal((await selected()).view,'video');
      await swipeStage(page,'left',{controls:true});assert.deepEqual(await selected(),{view:'photo',index:0});
      await swipeStage(page,'right',{controls:true});assert.equal((await selected()).view,'video');
      await swipeStage(page,'left');assert.deepEqual(await selected(),{view:'photo',index:0});
      assert.equal(await page.locator('[data-stage-video]').evaluate(video=>video.paused),true);
      for(let index=1;index<item.images.length;index++){
        await swipeStage(page,'left');assert.deepEqual(await selected(),{view:'photo',index});
      }
      assert.equal(requests.filter(url=>/model-viewer.*\.js|\.glb/.test(url)).length,0);
      await swipeStage(page,'left');assert.equal((await selected()).view,'model');
      await page.waitForFunction(()=>!!document.querySelector('[data-viewer]').model);
      frames.push(await galleryFrame(page));
      const orbit=await page.locator('[data-viewer]').evaluate(viewer=>viewer.getCameraOrbit().theta);
      await swipeStage(page,'left');assert.equal((await selected()).view,'model');
      await page.waitForFunction(before=>Math.abs(document.querySelector('[data-viewer]').getCameraOrbit().theta-before)>.1,orbit);
      await swipeStage(page,'left',{edge:true});assert.equal((await selected()).view,'model');
      await swipeStage(page,'right',{edge:true});assert.deepEqual(await selected(),{view:'photo',index:item.images.length-1});
      frames.push(await galleryFrame(page));sameFrames(frames);
      for(let index=item.images.length-2;index>=0;index--){await swipeStage(page,'right');assert.deepEqual(await selected(),{view:'photo',index});}
      await swipeStage(page,'right');assert.equal((await selected()).view,'video');
      await automaticVideoState(page);
      await swipeStage(page,'right');assert.equal((await selected()).view,'video');
      await swipeStage(page,'left');assert.equal((await selected()).view,'photo');
      const scrollable=await page.evaluate(()=>document.documentElement.scrollHeight>innerHeight);
      await swipeStage(page,'left',{vertical:true});assert.equal((await selected()).view,'photo');
      if(scrollable)await page.waitForFunction(()=>scrollY>0);
      else assert.equal(await page.evaluate(()=>scrollY),0);
      assert.deepEqual(errors,[]);
      results.push({case:'mobile '+item.kind+' full video surface swipes, vertical scroll and 3D rotation',frames,errors});
      await page.close();
    }
    {
      const {page,errors}=await setup(browser,true);
      const fixture=structuredClone(catalog),item=fixture.entries.find(row=>row.id===work.id);
      item.videos=[];item.model=null;item.images=Array.from({length:12},(_,index)=>({...work.images[0],url:work.images[0].url+'?swipe='+index}));
      await page.route('**/workshop/catalog.json',route=>route.fulfill({json:fixture}));
      await page.goto(base+'/prints/detail/?id='+item.id,{waitUntil:'load'});await ready(page);
      for(let index=1;index<12;index++){
        await swipeStage(page,'left');
        const selected=page.locator('[data-view][aria-pressed="true"]');
        assert.equal(await selected.getAttribute('data-media-index'),String(index));
        const box=await selected.boundingBox();assert.ok(box.x>=16&&box.x+box.width<=374,'swipe reveals active media button without scrolling the page');
      }
      await swipeStage(page,'left');assert.equal(await page.locator('[data-view][aria-pressed="true"]').getAttribute('data-media-index'),'11');
      const cdp=await page.context().newCDPSession(page),box=await page.locator('.wk-stage').boundingBox();
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:box.x+90,y:box.y+60},{x:box.x+200,y:box.y+60}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:box.x+40,y:box.y+60},{x:box.x+150,y:box.y+60}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      assert.equal(await page.locator('[data-view][aria-pressed="true"]').getAttribute('data-media-index'),'11');
      assert.deepEqual(errors,[]);results.push({case:'mobile photo-only swipes reveal all 12 buttons; boundary and multi-touch stay stable',errors});await page.close();
    }
    {
      const page=await browser.newPage({...device(false),hasTouch:true});
      await page.route('https://**',route=>route.abort());
      await page.goto(base+'/prints/detail/?id='+work.id,{waitUntil:'load'});await ready(page);
      assert.notEqual(await page.locator('html').getAttribute('data-ui'),'mobile');
      await page.locator('[data-view="photo"]').first().click();
      await swipeStage(page,'left');
      assert.equal(await page.locator('[data-view][aria-pressed="true"]').getAttribute('data-media-index'),'0');
      results.push({case:'desktop touch and existing gallery layout stay unchanged'});await page.close();
    }
    fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
    console.log(JSON.stringify({passed:results.length,cases:results.map(result=>result.case),evidence:path.resolve(out)},null,2));
  } finally {await browser.close();}
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'partial-results.json'),JSON.stringify(results,null,2));process.exitCode=1;});
