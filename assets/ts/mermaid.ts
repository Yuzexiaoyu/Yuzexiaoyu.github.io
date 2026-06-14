declare const mermaid: {
    initialize(config: Record<string, any>): void;
    run(options: { nodes: HTMLElement[] }): Promise<void>;
};

interface MermaidConfig {
    transparentBackground?: boolean;
    lightTheme?: string;
    darkTheme?: string;
    lightThemeVariables?: Record<string, any>;
    darkThemeVariables?: Record<string, any>;
    securityLevel?: string;
    look?: string;
    htmlLabels?: boolean;
    maxTextSize?: number;
    maxEdges?: number;
    fontSize?: number;
    fontFamily?: string;
    curve?: string;
    logLevel?: number;
}

type Scheme = 'light' | 'dark';

// ─── Swup SPA safety: global flags + shared mutable state ───
// setupModal's document-level delegation and the onColorSchemeChange
// listener must only be registered once — otherwise they accumulate
// across Swup navigations (which swap <body> but leave <head>/document
// listeners intact).
interface MermaidFlags { modalSetup: boolean; colorSchemeSetup: boolean }
const G = ((window as any).__mermaidG = (window as any).__mermaidG || { modalSetup: false, colorSchemeSetup: false }) as MermaidFlags;
let _pzInstance: any = null;
let _panzoom: any = null;
// SPA state that must persist across Swup navigations (this module is loaded
// once via dynamic import, so module-level vars survive page swaps):
let _io: IntersectionObserver | null = null;     // current lazy-render observer
let _appliedScheme: Scheme | null = null;        // theme currently on the diagrams

const PANZOOM_CDN = 'https://cdn.jsdelivr.net/npm/panzoom@9.4.3/+esm';

function getScheme(): Scheme {
    return document.documentElement.dataset.scheme === 'dark' ? 'dark' : 'light';
}

function buildThemeConfig(cfg: MermaidConfig, scheme: Scheme) {
    const isLight = scheme === 'light';
    const theme = isLight ? (cfg.lightTheme ?? 'default') : (cfg.darkTheme ?? 'dark');
    const vars = isLight ? (cfg.lightThemeVariables ?? {}) : (cfg.darkThemeVariables ?? {});
    return {
        theme,
        themeVariables: { ...vars, ...(cfg.transparentBackground ? { background: 'transparent' } : {}) },
    };
}

function buildBaseConfig(cfg: MermaidConfig): Record<string, any> {
    const base: Record<string, any> = {
        startOnLoad: false,
        securityLevel: cfg.securityLevel ?? 'strict',
        look: cfg.look ?? 'classic',
        flowchart: { htmlLabels: cfg.htmlLabels ?? true, useMaxWidth: true },
        gantt: { useWidth: 800 },
    };
    const optional: (keyof MermaidConfig)[] = ['maxTextSize', 'maxEdges', 'fontSize', 'fontFamily', 'curve', 'logLevel'];
    for (const key of optional) {
        if (cfg[key] != null) base[key] = cfg[key];
    }
    return base;
}

function initWithTheme(
    scheme: Scheme,
    themes: Record<Scheme, ReturnType<typeof buildThemeConfig>>,
    baseConfig: Record<string, any>,
) {
    const { theme, themeVariables } = themes[scheme];
    mermaid.initialize({
        ...baseConfig,
        theme,
        ...(Object.keys(themeVariables).length && { themeVariables }),
    });
}

async function renderOffscreen(sources: string[]): Promise<string[]> {
    const container = document.createElement('div');
    container.className = 'mermaid-offscreen';
    document.body.appendChild(container);
    const nodes = sources.map(src => {
        const n = document.createElement('pre');
        n.innerHTML = src;
        container.appendChild(n);
        return n;
    });
    await mermaid.run({ nodes });
    const results = nodes.map(n => n.innerHTML);
    container.remove();
    return results;
}

function setupWrappers(elements: NodeListOf<HTMLElement>) {
    elements.forEach((el, idx) => {
        // If already wrapped (e.g. Swup re-init edge case), update toolbar idx and skip
        if (el.parentElement?.classList.contains('mermaid-wrapper')) {
            const existingBtn = el.parentElement.querySelector('.mermaid-toolbar button') as HTMLElement | null;
            if (existingBtn) existingBtn.dataset.idx = String(idx);
            return;
        }
        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-wrapper';
        el.parentNode!.insertBefore(wrapper, el);
        wrapper.appendChild(el);
        wrapper.insertAdjacentHTML(
            'beforeend',
            `<div class="mermaid-toolbar"><button data-idx="${idx}" title="Open fullscreen with pan/zoom">Expand</button></div>`,
        );
    });
}

function setupModal(elements: NodeListOf<HTMLElement>) {
    // ── Always refresh per-call state ──
    _pzInstance = null;

    // ── Dynamic DOM helpers (called from once-registered delegated handlers,
    //     so they use document.getElementById instead of closure captures) ──
    const loadPanzoom = async () => {
        if (!_panzoom) {
            _panzoom = (await import(PANZOOM_CDN)).default;
        }
        return _panzoom;
    };

    const fitToScreen = () => {
        const mc = document.getElementById('mermaid-modal-content');
        if (!mc || !_pzInstance) return;
        const wrapper = mc.querySelector('.mermaid-panzoom-container') as HTMLElement | null;
        if (!wrapper) return;
        const w = +(wrapper.dataset.nativeWidth ?? 0);
        const h = +(wrapper.dataset.nativeHeight ?? 0);
        const rect = mc.getBoundingClientRect();
        const scale = Math.min((rect.width - 60) / w, (rect.height - 60) / h);
        _pzInstance.zoomAbs(0, 0, scale);
        _pzInstance.moveTo((rect.width - w * scale) / 2, (rect.height - h * scale) / 2);
    };

    const closeModal = () => {
        const m = document.getElementById('mermaid-modal');
        if (m) m.classList.remove('active');
        document.body.style.overflow = '';
        _pzInstance?.dispose();
        _pzInstance = null;
        const mc = document.getElementById('mermaid-modal-content');
        if (mc) mc.innerHTML = '';
    };

    const openModal = async (idx: number) => {
        // Dynamic element lookup — safe for Swup re-init (DOM is replaced)
        const els = document.querySelectorAll('.mermaid');
        const svg = els[idx]?.querySelector('svg');
        if (!svg) return;

        const mc = document.getElementById('mermaid-modal-content');
        const m = document.getElementById('mermaid-modal');
        if (!mc || !m) return;

        const svgClone = svg.cloneNode(true) as SVGElement;
        const viewBox = svg.getAttribute('viewBox');
        const [w, h] = viewBox
            ? viewBox.split(/[\s,]+/).slice(2).map(Number)
            : [svg.getBoundingClientRect().width || 800, svg.getBoundingClientRect().height || 600];
        svgClone.setAttribute('width', String(w));
        svgClone.setAttribute('height', String(h));

        const wrapper = document.createElement('div');
        wrapper.className = 'mermaid-panzoom-container';
        wrapper.dataset.nativeWidth = String(w);
        wrapper.dataset.nativeHeight = String(h);
        wrapper.appendChild(svgClone);

        mc.innerHTML = '';
        mc.appendChild(wrapper);
        m.classList.add('active');
        document.body.style.overflow = 'hidden';

        const pz = await loadPanzoom();
        setTimeout(() => {
            _pzInstance = pz(wrapper, { maxZoom: 10, minZoom: 0.05, bounds: false });
            fitToScreen();
            wrapper.classList.add('ready');
        }, 50);
    };

    // ── Per-call: re-bind element-level listeners (DOM nodes are fresh)
    const closeBtn = document.getElementById('mermaid-modal-close');
    const modalBody = document.getElementById('mermaid-modal-body');
    if (closeBtn) {
        closeBtn.addEventListener('click', closeModal);
    }
    if (modalBody) {
        modalBody.addEventListener('click', (e) => { if (e.target === modalBody) closeModal(); });
    }

    // ── Document-level delegation — register ONCE (persists across Swup) ──
    if (!G.modalSetup) {
        G.modalSetup = true;

        document.addEventListener('click', (e) => {
            const target = e.target as HTMLElement;
            const toolbarBtn = target.closest('.mermaid-toolbar button') as HTMLElement | null;
            if (toolbarBtn) return openModal(+(toolbarBtn.dataset.idx!));
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                const m = document.getElementById('mermaid-modal');
                if (m && m.classList.contains('active')) closeModal();
            }
        });
    }
}

export async function initMermaidPage(config: MermaidConfig) {
    const elements = document.querySelectorAll('.mermaid') as NodeListOf<HTMLElement>;
    if (!elements.length) return;

    const sources = Array.from(elements).map(el => el.innerHTML);
    const perDiagramTransparent = sources.map(src => /%%\s*transparent\s*%%/i.test(src));

    const themes = {
        light: buildThemeConfig(config, 'light'),
        dark: buildThemeConfig(config, 'dark'),
    };
    const baseConfig = buildBaseConfig(config);

    const applyTransparency = (el: HTMLElement, i: number) => {
        if (perDiagramTransparent[i]) el.querySelector('svg')?.style.setProperty('background', 'transparent');
    };

    setupWrappers(elements);
    setupModal(elements);

    const scheme = getScheme();
    _appliedScheme = scheme;
    initWithTheme(scheme, themes, baseConfig);

    // ─── Lazy, yielded rendering ───
    // Mermaid lays out and rasterises each diagram synchronously on the main
    // thread. The old code rendered every diagram on the page in one
    // `mermaid.run({ nodes: all })` call, producing a single long task right as
    // the Swup page transition ran — the "卡一下" when opening an article.
    //
    // A real background thread can't help: Mermaid measures text through the
    // DOM (getBBox / getComputedTextLength) and emits SVG, none of which exist
    // in a Web Worker. So we stay on the main thread but (a) render a diagram
    // only when it nears the viewport, and (b) render one-per-task with a yield
    // in between, slicing the work into short chunks the browser can interleave
    // with painting and input. Diagrams below the fold — the common case — cost
    // nothing until the reader scrolls near them.
    const yieldToMain = (): Promise<void> => {
        const s = (window as any).scheduler;
        if (s && typeof s.yield === 'function') return s.yield();
        return new Promise<void>(r => setTimeout(r, 0));
    };

    const pending: HTMLElement[] = [];
    const rendered = new WeakSet<HTMLElement>();
    let flushing = false;

    const renderOne = async (el: HTMLElement) => {
        if (rendered.has(el)) return;
        rendered.add(el);
        const i = Array.prototype.indexOf.call(elements, el);
        try {
            await mermaid.run({ nodes: [el] });
        } catch (e) {
            console.error('Mermaid render failed:', e);
        }
        el.style.visibility = '';
        if (i >= 0) applyTransparency(el, i);
    };

    const flush = async () => {
        if (flushing) return;
        flushing = true;
        while (pending.length) {
            await renderOne(pending.shift()!);
            if (pending.length) await yieldToMain();
        }
        flushing = false;
    };

    // Disconnect the previous navigation's observer so observers don't pile up.
    _io?.disconnect();
    _io = null;
    if ('IntersectionObserver' in window) {
        const io = _io = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (!entry.isIntersecting) continue;
                io.unobserve(entry.target);
                pending.push(entry.target as HTMLElement);
            }
            flush();
        }, { rootMargin: '400px 0px' });
        elements.forEach(el => io.observe(el));
    } else {
        elements.forEach(el => pending.push(el));
        flush();
    }

    // Theme toggle re-render (colorScheme.toggle = true only; this site has it
    // off, so this never fires in practice). Render fresh copies off-screen for
    // the new theme and swap. Registered once so listeners don't pile up across
    // Swup navigations.
    if (!G.colorSchemeSetup) {
        G.colorSchemeSetup = true;
        window.addEventListener('onColorSchemeChange', async () => {
            const newScheme = getScheme();
            // StackColorScheme's constructor re-dispatches this on every Swup
            // navigation, so bail unless the theme genuinely changed — otherwise
            // we'd re-render every diagram off-screen on each navigation.
            if (newScheme === _appliedScheme) return;
            _appliedScheme = newScheme;
            initWithTheme(newScheme, themes, baseConfig);
            const swap = await renderOffscreen(sources);
            elements.forEach((el, i) => {
                el.innerHTML = swap[i];
                el.style.visibility = '';
                applyTransparency(el, i);
            });
        });
    }
}
