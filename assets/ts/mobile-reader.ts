/* Original chapter clones are the source of truth. Reflow never rebuilds from split pages. */
export function createMobilePagination(content: HTMLElement, viewport: HTMLElement) {
  type Anchor = {block:string;offset:number;scroll?:number};
  let pages: HTMLElement[] = [];
  let version = 0;
  let operation: AbortController | null = null;
  const containers = /^(DIV|SECTION|ARTICLE|MAIN|BODY)$/;

  function flatten(parent: HTMLElement, out: HTMLElement[], inherited: string[] = []): void {
    Array.from(parent.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) {
        if (!node.textContent?.trim()) return;
        const p = document.createElement('p'); p.textContent = node.textContent; out.push(p); return;
      }
      if (!(node instanceof HTMLElement) && !(node instanceof SVGElement)) return;
      const el = node as HTMLElement;
      if (/^(SCRIPT|STYLE|LINK|META)$/.test(el.tagName)) return;
      if (containers.test(el.tagName) && el.children.length && !Array.from(el.childNodes).some(n=>n.nodeType===3 && n.textContent?.trim())) {
        flatten(el,out,el.id?[...inherited,el.id]:inherited);
      } else {
        inherited.forEach(id=>{if(!el.querySelector(`[id="${CSS.escape(id)}"]`) && el.id!==id){const a=document.createElement('span');a.id=id;el.prepend(a);}});
        inherited=[]; out.push(el);
      }
    });
  }

  function slice(source: HTMLElement, start: number, end: number): HTMLElement {
    const walker = document.createTreeWalker(source,NodeFilter.SHOW_TEXT);
    const nodes: Text[]=[]; let n: Node | null;
    while ((n=walker.nextNode())) nodes.push(n as Text);
    const range=document.createRange();
    const locate=(offset:number):[Node,number]=>{for(const node of nodes){if(offset<=node.length)return [node,offset];offset-=node.length;}return [source,source.childNodes.length];};
    const [a,ai]=locate(start),[b,bi]=locate(end);
    range.setStart(a,ai);range.setEnd(b,bi);
    const el=source.cloneNode(false) as HTMLElement;el.appendChild(range.cloneContents());
    source.querySelectorAll<HTMLElement>('[id]').forEach(anchor=>{
      if(anchor.textContent || anchor.querySelector('img,svg') || el.querySelector(`#${CSS.escape(anchor.id)}`))return;
      const prefix=document.createRange();prefix.selectNodeContents(source);prefix.setEndBefore(anchor);
      const at=prefix.toString().length;
      if(at>=start && at<end)el.prepend(anchor.cloneNode(true));
      else if(at===end && end===source.textContent!.length)el.append(anchor.cloneNode(true));
    });
    if(start>0)el.removeAttribute('id');
    el.dataset.mOffset=String(start); return el;
  }

  async function paginate(book:any): Promise<boolean> {
    const token=++version;
    operation?.abort();
    operation=new AbortController();
    const signal=operation.signal;
    const isCurrent=()=>token===version && !signal.aborted && content.isConnected;
    if(!book.mobileSources)book.mobileSources=book.chapters.map((ch:any)=>({idx:ch.idx,source:ch.anchor.cloneNode(true)}));
    const images=Array.from(content.querySelectorAll('img'));
    await Promise.all(images.map(img=>img.complete?Promise.resolve():new Promise<void>(resolve=>{
      const timer=setTimeout(done,3000);
      function done(){clearTimeout(timer);img.removeEventListener('load',done);img.removeEventListener('error',done);signal.removeEventListener('abort',done);resolve();}
      img.addEventListener('load',done,{once:true});img.addEventListener('error',done,{once:true});
      signal.addEventListener('abort',done,{once:true});
    })));
    if(!isCurrent())return false;
    const width=viewport.clientWidth,height=viewport.clientHeight;
    if(width<=0 || height<=0)return false;
    viewport.style.setProperty('--m-reader-image-height',`${Math.max(48,height-64)}px`);
    if(!pages.some(page=>page.parentElement?.parentElement===content))content.replaceChildren();
    // Measure a hidden staging row while keeping the current reading page intact.
    // Publish only a completed operation; cancelled work owns and removes only its row.
    const row=document.createElement('div');row.className='reader-pages';
    row.style.cssText=`position:absolute;top:0;left:0;width:${width}px;height:${height}px;visibility:hidden;pointer-events:none;contain:layout style paint`;
    row.setAttribute('aria-hidden','true');row.inert=true;content.appendChild(row);
    const nextPages:HTMLElement[]=[];
    const chapterStartPages:Record<number,number>={};
    let committed=false, sliceStarted=performance.now();
    const yieldToInput=async()=>{await new Promise<void>(resolve=>setTimeout(resolve,0));sliceStarted=performance.now();};
    let page:HTMLElement;
    // Keep only the page being measured in the staging row. Finished pages stay detached,
    // so each paragraph measurement avoids laying out every earlier page in a long book.
    const addPage=(chapter:number)=>{page?.remove();page=document.createElement('div');page.className='reader-page';page.style.width=`${width}px`;page.dataset.mChapter=String(chapter);row.appendChild(page);nextPages.push(page);};
    const fits=()=>page.scrollHeight<=height+2;
    try {
      for(const chapter of book.mobileSources){
        const clone=chapter.source.cloneNode(true) as HTMLElement;
        const blocks:HTMLElement[]=[];flatten(clone,blocks);
        addPage(chapter.idx);page!.dataset.chapterStart=String(chapter.idx);chapterStartPages[chapter.idx]=nextPages.length-1;
        for(let index=0;index<blocks.length;index++){
          if(performance.now()-sliceStarted>=12){await yieldToInput();if(!isCurrent())return false;}
          const block=blocks[index];block.dataset.mBlock=`${chapter.idx}:${index}`;block.dataset.mOffset='0';
          page!.appendChild(block);
          if(fits())continue;
          block.remove();if(page!.children.length)addPage(chapter.idx);
          page!.appendChild(block);if(fits())continue;
          // Text paragraphs are split by measured DOM ranges; atomic media/table/code stays locally scrollable.
          if(!block.textContent?.length || block.querySelector('img,svg,table,pre') || /^(IMG|SVG|TABLE|PRE)$/.test(block.tagName)){
            page!.dataset.mScrollable='true';continue;
          }
          block.remove();const text=block.textContent;let offset=0;
          while(offset<text.length){
            if(performance.now()-sliceStarted>=12){await yieldToInput();if(!isCurrent())return false;}
            let low=offset+1,high=text.length,best=offset;
            while(low<=high){const mid=Math.floor((low+high)/2),piece=slice(block,offset,mid);page!.appendChild(piece);const fit=fits();piece.remove();if(fit){best=mid;low=mid+1;}else high=mid-1;}
            if(best===offset){page!.appendChild(slice(block,offset,text.length));page!.dataset.mScrollable='true';break;}
            if(best<text.length && /[\uD800-\uDBFF]/.test(text.charAt(best-1)))best--;
            if(best<=offset)best=offset+(text.codePointAt(offset)!>0xffff?2:1);
            page!.appendChild(slice(block,offset,best));offset=best;
            if(offset<text.length)addPage(chapter.idx);
          }
        }
      }
      if(!nextPages.length)addPage(0);
      // EPUB files have separate ID namespaces. Deduplicate split spans within a chapter,
      // preserving identically named notes in other chapters for target(id, chapter).
      const chapterIds=new Map<string,Set<string>>();
      for(const nextPage of nextPages){
        if(performance.now()-sliceStarted>=12){await yieldToInput();if(!isCurrent())return false;}
        const chapter=nextPage.dataset.mChapter!;
        const ids=chapterIds.get(chapter)||new Set<string>();chapterIds.set(chapter,ids);
        nextPage.querySelectorAll<HTMLElement>('[id]').forEach(el=>{if(ids.has(el.id))el.removeAttribute('id');else ids.add(el.id);});
      }
      if(!isCurrent())return false;
      row.replaceChildren(...nextPages);
      row.style.cssText='';row.removeAttribute('aria-hidden');row.inert=false;
      content.replaceChildren(row);pages=nextPages;
      book.chapterStartPages=chapterStartPages;book.totalPagesCount=pages.length;
      committed=true;
      return true;
    } finally {
      if(!committed)row.remove();
    }
  }

  function capture(index:number):Anchor|null {
    const page=pages[index],block=page?.querySelector<HTMLElement>('[data-m-block]');
    return block?{block:block.dataset.mBlock!,offset:Number(block.dataset.mOffset||0),scroll:page.scrollHeight>page.clientHeight?page.scrollTop/Math.max(1,page.scrollHeight-page.clientHeight):0}:null;
  }
  function restore(anchor:Anchor):number|null {
    if(!anchor?.block)return null;
    let result:number|null=null;
    pages.forEach((page,i)=>page.querySelectorAll<HTMLElement>('[data-m-block]').forEach(el=>{if(el.dataset.mBlock===anchor.block && Number(el.dataset.mOffset||0)<=anchor.offset)result=i;}));
    if(result!==null && anchor.scroll)pages[result].scrollTop=anchor.scroll*(pages[result].scrollHeight-pages[result].clientHeight);
    return result;
  }
  function target(id:string,chapter?:number):number|null {
    const i=pages.findIndex(page=>(chapter===undefined||Number(page.dataset.mChapter)===chapter) && (page.id===id || !!page.querySelector(`#${CSS.escape(id)}`)));
    return i<0?null:i;
  }
  return {paginate,capture,restore,target,cancel:()=>{version++;operation?.abort();}};
}
