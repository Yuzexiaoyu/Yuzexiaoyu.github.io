/* Opt-in, local-only diagnostics. No observer, timer, GPU query or UI is created
 * during normal visits. Callback frequency is deliberately not labelled FPS. */
type Sample = { phase: number; ms: number };
const summarize = (values: number[]) => {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  return { count: values.length, meanMs: values.reduce((a,b) => a+b,0) / values.length,
    medianMs: sorted[Math.floor(sorted.length/2)],
    p95Ms: sorted[Math.min(sorted.length-1,Math.floor(sorted.length*.95))], maxMs: sorted[sorted.length-1] };
};

export function createIntroProfile(loader: HTMLElement) {
  if (new URLSearchParams(location.search).get('intro-profile') !== '1') return null;
  const created = performance.now(), intervals: Sample[] = [], submissions: Sample[] = [];
  const viewport = [innerWidth,innerHeight], dpr = devicePixelRatio;
  const gpuTimes: number[] = [], longTasks: { start: number; ms: number }[] = [];
  let started = 0, frame = 0, previous = 0, previousPhase = -1, repeatedClock = 0, done = false;
  let clock: Animation | undefined, mode = 'css', fallbackReason = '', frameCount = 0;
  let endingReason = '';
  let gl: WebGLRenderingContext | null = null, ext: any = null, activeQuery: any = null;
  const queries: any[] = [];
  let taskObserver: PerformanceObserver | null = null;
  if (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
    taskObserver = new PerformanceObserver(list => list.getEntries().forEach(entry =>
      longTasks.push({ start: entry.startTime, ms: entry.duration })));
    taskObserver.observe({ type: 'longtask', buffered: true });
  }
  const pollGPU = () => {
    if (!gl || !ext || !queries.length) return;
    if (gl.isContextLost()) { queries.length = 0; return; }
    if (gl.getParameter(ext.GPU_DISJOINT_EXT)) {
      queries.splice(0).forEach(query => ext.deleteQueryEXT(query));
      return;
    }
    while (queries.length && ext.getQueryObjectEXT(queries[0], ext.QUERY_RESULT_AVAILABLE_EXT)) {
      const query = queries.shift();
      gpuTimes.push(ext.getQueryObjectEXT(query, ext.QUERY_RESULT_EXT) / 1e6);
      ext.deleteQueryEXT(query);
    }
  };
  const show = (report: any) => {
    if (!loader.isConnected) return;
    const panel = document.createElement('details');
    panel.id = 'mobile-intro-profile'; panel.open = true;
    panel.style.cssText = 'position:fixed;bottom:12px;right:12px;left:12px;max-width:560px;max-height:70dvh;overflow:auto;z-index:2147483647;background:#111;color:#eee;padding:16px;border:1px solid #666;border-radius:10px;font:13px/1.6 system-ui';
    const summary = document.createElement('summary'); summary.textContent = '开场动画测量（仅本机）';
    const text = document.createElement('pre'); text.style.cssText = 'white-space:pre-wrap;font:inherit';
    const format = (value: number | undefined) => value === undefined ? '不可用' : value.toFixed(2);
    text.textContent = `版本：${report.version}\n绘制：${mode}${fallbackReason ? `（${fallbackReason}）` : ''}` +
      `\n视口：${viewport.join('×')} / DPR ${dpr}` +
      `\n回调频率：${report.frames ? (1000/report.frames.meanMs).toFixed(1) : '不可用'} Hz` +
      `\n滑动回调间隔 P95：${format(report.slide?.p95Ms)} ms` +
      `\nCPU 绘制提交 P95：${format(report.submission?.p95Ms)} ms` +
      `\nGPU 绘制 P95：${format(report.gpu?.p95Ms)} ms` +
      `\n长任务记录：${report.longTaskSupport ? report.longTasks.length : '此浏览器不支持'}` +
      '\n回调频率不是实际显示帧率；计时精度由浏览器决定。GPU 计时不可用不代表 GPU 未工作。';
    const copy = document.createElement('button'); copy.textContent = '复制测量结果';
    copy.onclick = async () => {
      const json = JSON.stringify(report,null,2);
      try { await navigator.clipboard.writeText(json); copy.textContent = '已复制'; }
      catch { text.textContent = json; }
    };
    const close = document.createElement('button'); close.textContent = '关闭';
    close.style.marginLeft = '12px'; close.onclick = () => panel.remove();
    panel.append(summary,text,copy,close); document.body.append(panel);
  };
  const dispose = () => {
    observer.disconnect(); taskObserver?.disconnect(); cancelAnimationFrame(frame);
    clearTimeout(watchdog); window.removeEventListener('pagehide', abandon);
    if (ext) queries.splice(0).forEach(query => ext.deleteQueryEXT(query));
  };
  const finish = (reason: string) => {
    if (done) return;
    done = true;
    pollGPU();
    const report = { version: 'gpu-static-v2', renderer: mode, fallbackReason: fallbackReason || null,
      endReason: endingReason || reason, userAgent: navigator.userAgent, viewport, dpr,
      setupMs: started ? started-created : null, frames: summarize(intervals.map(s => s.ms)),
      slide: summarize(intervals.filter(s => s.phase >= 1550).map(s => s.ms)),
      submission: summarize(submissions.map(s => s.ms)), gpu: summarize(gpuTimes), gpuTimerSupport: !!ext,
      repeatedClock, longTaskSupport: !!taskObserver,
      longTasks: longTasks.filter(t => t.start+t.ms >= started && t.start <= performance.now()) };
    (window as any).__mobileIntroProfile = report;
    dispose();
    setTimeout(() => show(report),350);
  };
  const abandon = () => { done = true; dispose(); };
  const sample = (now: number) => {
    if (done) return;
    if (!loader.isConnected) { abandon(); return; }
    const phase = Number(clock?.currentTime) || now-started;
    if (previous) intervals.push({ phase, ms: now-previous });
    if (phase === previousPhase) repeatedClock++;
    previousPhase = phase; previous = now;
    frame = requestAnimationFrame(sample);
  };
  const observer = new MutationObserver(() => {
    if (loader.classList.contains('hidden') || loader.style.display === 'none') { finish('finished'); return; }
    if (!started && loader.classList.contains('m-intro-ready')) {
      started = performance.now();
      clock = loader.getAnimations({ subtree: true }).find(a =>
        a.id === 'mobile-intro-clock' || (a as CSSAnimation).animationName === 'm-intro-row-exit');
      frame = requestAnimationFrame(sample);
    }
  });
  observer.observe(loader,{ attributes:true,attributeFilter:['class','style'] });
  const watchdog = setTimeout(() => finish('timeout'),10000);
  window.addEventListener('pagehide',abandon,{once:true});
  return {
    ending(reason: string) { endingReason = reason; },
    fallback(reason: string) { fallbackReason = reason; },
    attachGPU(context: WebGLRenderingContext) {
      gl = context; mode = 'webgl-static';
      ext = gl.getExtension('EXT_disjoint_timer_query');
    },
    beginDraw() {
      if (ext && ++frameCount % 8 === 0) {
        pollGPU();
        activeQuery = ext.createQueryEXT();
        if (activeQuery) ext.beginQueryEXT(ext.TIME_ELAPSED_EXT,activeQuery);
      }
      return performance.now();
    },
    endDraw(phase: number, start: number) {
      submissions.push({ phase, ms: performance.now()-start });
      if (activeQuery) { ext.endQueryEXT(ext.TIME_ELAPSED_EXT); queries.push(activeQuery); activeQuery = null; }
    },
  };
}
