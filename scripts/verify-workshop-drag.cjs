const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const base=process.argv[2]||'http://127.0.0.1:13136';
const out=process.argv[3]||'.local/print-workshop/qa/follow-drag';
const work=JSON.parse(fs.readFileSync('static/workshop/catalog.json','utf8')).entries.find(row=>row.kind==='work');
const results=[];
fs.mkdirSync(out,{recursive:true});
const idle=page=>page.waitForFunction(()=>!document.querySelector('.wk-stage')?.classList.contains('is-swiping'));
async function mount(browser,reducedMotion='no-preference'){
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true,reducedMotion,userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  if(base.startsWith('http://127.0.0.1'))await page.route('https://**',route=>route.abort());
  await page.goto(base+'/prints/detail/?id='+work.id,{waitUntil:'load'});
  await page.waitForFunction(()=>window.WorkshopApp&&!window.WorkshopIntro.active()&&document.querySelector('.wk-detail-grid'));
  await page.locator('[data-view="photo"]').first().click();
  await page.locator('[data-stage-image]').evaluate(image=>image.decode());
  const cdp=await page.context().newCDPSession(page),box=await page.locator('.wk-stage').boundingBox();
  const point={x:box.x+box.width*.72,y:box.y+box.height/2};
  const start=(y=point.y)=>{point.y=y;return cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});};
  const move=dx=>cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:point.x+dx,y:point.y}]});
  const end=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const cancel=()=>cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});
  const state=()=>page.evaluate(()=>{
    const stage=document.querySelector('.wk-stage'),image=document.querySelector('[data-stage-image]'),preview=document.querySelector('.wk-swipe-preview'),button=document.querySelector('[data-view].is-active');
    const frame=stage.getBoundingClientRect(),current=image.getBoundingClientRect(),incoming=preview?.getBoundingClientRect();
    return {view:button.dataset.view,index:Number(button.dataset.mediaIndex||0),x:current.x-frame.x,width:frame.width,height:frame.height,previewX:incoming?incoming.x-frame.x:null,previewSrc:preview?.getAttribute('src'),previewVisible:!!preview&&!preview.hidden,swiping:stage.classList.contains('is-swiping'),animations:stage.getAnimations({subtree:true}).filter(animation=>animation.id==='workshop-gallery-snap').map(animation=>({time:animation.currentTime,state:animation.playState}))};
  });
  return {page,errors,box,start,move,end,cancel,state,cdp};
}
(async()=>{
 const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL||undefined,args:['--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 try{
  for(const reduced of ['no-preference','reduce']){
   const {page,errors,box,start,move,end,cancel,state}=await mount(browser,reduced);
   const samples=[];
   await start();
   for(const dx of [-40,-180,-60]){
    await move(dx);const sample=await state();samples.push(sample);
    assert.ok(Math.abs(sample.x-dx)<1,'visible media must follow the finger before release');
    assert.ok(Math.abs(sample.previewX-(box.width+dx))<1,'neighbor must stay adjacent to the current image');
    assert.equal(sample.index,0);assert.equal(sample.view,'photo');assert.equal(sample.previewSrc,work.images[1].url);
    if(dx===-180){
     await page.locator('.wk-swipe-preview').evaluate(image=>image.decode());
     await page.screenshot({path:path.join(out,'held-drag-'+reduced+'.png')});
    }
   }
   await cancel();
   const released=await state();
   if(reduced==='no-preference'){
    assert.ok(released.animations.length>0,'release must animate back rather than switch instantly');
    assert.ok(released.x<0,'snap-back must start from the dragged position');
   }
   await idle(page);assert.equal((await state()).x,0);assert.equal((await state()).index,0);assert.equal(await page.locator('.wk-swipe-preview').count(),0);
   await start();await move(-60);await page.waitForTimeout(120);await end();await idle(page);
   assert.equal((await state()).index,0,'short slow drag must return to the same image');
   await start();await move(-140);await end();
   const settling=await state();
   if(reduced==='no-preference')assert.ok(settling.animations.length>0&&settling.x<0&&settling.x>-box.width,'release must visibly settle toward the next item');
   await idle(page);const final=await state();assert.equal(final.index,1);assert.equal(final.x,0);assert.equal(final.swiping,false);
   assert.equal(await page.locator('[data-stage-image]').getAttribute('src'),work.images[1].url);
   assert.equal(final.width,box.width);assert.equal(final.height,box.height);assert.deepEqual(errors,[]);
   await page.screenshot({path:path.join(out,'settled-'+reduced+'.png')});
   results.push({case:'finger tracking, reversal, neighboring preview, slow short return and animated release '+reduced,samples,released,settling,final,errors});await page.close();
  }
  {
   const {page,errors,box,start,move,end,cancel,state}=await mount(browser);
   await start();await move(-140);await end();
   await start();const resumed=await state();
   assert.ok(resumed.x<0&&resumed.x>-box.width);assert.equal(resumed.animations.length,0,'new touch takes over the current compositor position');
   await move(24);const continued=await state();assert.ok(Math.abs(continued.x-resumed.x-24)<1,'interrupted settling continues from the visible position');
   await cancel();await idle(page);assert.equal((await state()).index,1,'cancelled takeover completes the already released selection');
   await page.locator('[data-view="video"]').first().click();
   await start();await move(100);
   const boundary=await page.locator('[data-stage-video]').evaluate(video=>video.getBoundingClientRect().x-video.parentElement.getBoundingClientRect().x);
   assert.ok(boundary>0&&boundary<100,'first item has bounded edge resistance');
   await end();await idle(page);assert.equal((await state()).view,'video');
   await page.locator('[data-view="photo"]').first().click();
   await start();await move(-100);
   await page.locator('[data-view="video"]').first().click();
   await end();await idle(page);assert.equal((await state()).view,'video');
   assert.equal(await page.locator('.wk-swipe-preview').count(),0);
   await page.locator('[data-view="photo"]').first().click();await start();await move(-100);
   await page.locator('[data-detail-back]').click();
   await page.waitForSelector('.wk-card');
   assert.equal(await page.locator('.wk-swipe-preview,.wk-swipe-current').count(),0);
   assert.deepEqual(errors,[]);results.push({case:'interrupted settling stays continuous, edge resistance, external choice and navigation cleanup',resumed,continued,boundary,errors});await page.close();
  }
  for(const kind of ['work','product']){
   const {page,errors,box,start,move,end,cancel,cdp}=await mount(browser);
   if(kind==='product'){
    const product=JSON.parse(fs.readFileSync('static/workshop/catalog.json','utf8')).entries.find(row=>row.kind==='product');
    await page.goto(base+'/prints/detail/?id='+product.id,{waitUntil:'load'});
    await page.waitForFunction(()=>window.WorkshopApp&&!window.WorkshopIntro.active()&&document.querySelector('.wk-detail-grid'));
   }else await page.locator('[data-view="video"]').first().click();
   const video=page.locator('[data-stage-video]'),replay=page.locator('[data-video-replay]');
   assert.equal(await video.evaluate(video=>video.controls),false);
   assert.equal(await video.evaluate(video=>getComputedStyle(video).pointerEvents),'none');
   const finishVideo=async()=>{
    await video.evaluate(async video=>{if(video.readyState<2)await new Promise(resolve=>video.addEventListener('loadeddata',resolve,{once:true}));video.currentTime=video.duration-.05;await video.play();});
    await page.waitForFunction(()=>document.querySelector('[data-stage-video]').ended);
    await replay.waitFor({state:'visible'});
   };
   await finishVideo();
   const center=await replay.evaluate(button=>{
    const b=button.getBoundingClientRect(),f=button.closest('.wk-stage').getBoundingClientRect();
    return {x:b.x+b.width/2-f.x-f.width/2,y:b.y+b.height/2-f.y-f.height/2};
   });assert.ok(Math.abs(center.x)<.5&&Math.abs(center.y)<.5,'replay is centered in the media frame');
   await page.screenshot({path:path.join(out,'mobile-'+kind+'-video-replay.png')});
   await replay.click();
   assert.ok(await video.evaluate(video=>!video.paused&&!video.ended&&video.currentTime<video.duration/2));
   assert.equal(await replay.isVisible(),false);
   await finishVideo();await replay.press('Enter');
   assert.ok(await video.evaluate(video=>!video.paused&&!video.ended&&video.currentTime<video.duration/2));
   await finishVideo();
   await page.evaluate(()=>{window.__replayPlays=0;document.querySelector('[data-stage-video]').addEventListener('play',()=>window.__replayPlays++);});
   const stage=await page.locator('.wk-stage').boundingBox(),middle={x:stage.x+stage.width/2,y:stage.y+stage.height/2};
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[middle]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:middle.x-80,y:middle.y}]});
   const moving=await page.evaluate(()=>{
    const frame=document.querySelector('.wk-stage').getBoundingClientRect();
    return {video:document.querySelector('[data-stage-video]').getBoundingClientRect().x-frame.x,overlay:document.querySelector('[data-video-replay-layer]').getBoundingClientRect().x-frame.x};
   });assert.ok(Math.abs(moving.video+80)<1&&Math.abs(moving.overlay+80)<1,'swipe started on replay moves video and button together');
   await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await idle(page);
   assert.equal(await video.evaluate(video=>video.ended),true);assert.equal(await replay.isVisible(),true);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[middle]});
   for(let n=1;n<=8;n++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:middle.x-140*n/8,y:middle.y}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await idle(page);
   assert.equal(await page.locator('[data-view].is-active').getAttribute('data-view'),'photo');
   assert.equal(await replay.isVisible(),false);assert.equal(await page.evaluate(()=>window.__replayPlays),0,'dragging replay must not also replay the video');
   await page.locator('[data-view="video"]').first().click();
   await start(stage.y+stage.height-15);await move(-100);
   const bottom=await video.evaluate(video=>video.getBoundingClientRect().x-video.parentElement.getBoundingClientRect().x);
   assert.ok(Math.abs(bottom+100)<1,'video bottom follows finger too');
   await end();await idle(page);assert.equal(await page.locator('[data-view].is-active').getAttribute('data-view'),'photo');
   assert.deepEqual(errors,[]);results.push({case:kind+' video without controls, centered replay by tap or keyboard, replay-button and bottom-edge drags',center,moving,bottom,errors});await page.close();
  }
  fs.writeFileSync(path.join(out,'results.json'),JSON.stringify(results,null,2));
  console.log(JSON.stringify({passed:results.length,cases:results.map(row=>row.case),evidence:path.resolve(out)},null,2));
 }finally{await browser.close();}
})().catch(error=>{console.error(error);fs.writeFileSync(path.join(out,'partial-results.json'),JSON.stringify(results,null,2));process.exitCode=1;});
