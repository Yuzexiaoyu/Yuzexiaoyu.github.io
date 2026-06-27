/*
 * music-uploads.ts —— 用户自定义曲目列表（主页 + 小说页共用同一个 APlayer 实例）
 *
 * 纯前端实现。管理面板把「内置曲目」和「用户上传」统一列出，可对整张列表自由编辑：
 *   - 上传音频：File -> 读 ID3 -> 存 IndexedDB(Blob) -> createObjectURL -> ap.list.add()
 *   - 删除任意曲目（含内置）：内置删除记到 localStorage 隐藏名单，载入时重新移除
 *   - 更换任意曲目封面：上传曲存进其记录，内置曲的封面覆盖单独存 IndexedDB
 *   - 一键恢复内置曲目：清隐藏名单 + 清封面覆盖 + 补回缺失内置曲
 *
 * 内置曲目仍由 layouts/partials/footer/custom.html 注入（其 /music/ 路径靠
 * replace-media-links.py 在构建时重写到 CDN，不能挪进本模块），本模块只“增删改”这张表。
 *
 * 暴露 window.__musicUploads，供本模块自启动 + 小说页 mini-player 歌单调用。
 */

interface UploadRecord {
  id: string;
  name: string;
  artist: string;
  audioBlob: Blob;
  coverBlob: Blob | null;
  mime: string;
  size: number;
  addedAt: number;
}

interface BuiltinCover {
  name: string;
  coverBlob: Blob;
}

interface BuiltinDef {
  name: string;
  artist: string;
  url: string;
  cover: string;
}

const DB_NAME = "yuze-music-uploads";
const DB_VERSION = 2;
const STORE = "tracks"; // 上传曲目（含 Blob）
const BCOVER_STORE = "builtinCovers"; // 内置曲封面覆盖
const LS_REMOVED = "yuze-music-builtin-removed"; // 隐藏的内置曲名单（localStorage）
const THEME = "#4FC3F7";
const MAX_TOTAL_BYTES = 1024 * 1024 * 1024; // 上传总量上限 1GB（单文件不单独限制，仅受此总量约束）
const AUDIO_EXT = /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav|wave)$/i;

// 默认封面（音符 SVG，内联 data-URI，避免额外网络请求）
const DEFAULT_COVER =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80" viewBox="0 0 80 80">' +
      '<rect width="80" height="80" rx="8" fill="#2b3038"/>' +
      '<path d="M50 22v24.5a9 9 0 1 1-4-7.48V30l-16 3.4v17.9a9 9 0 1 1-4-7.48V28.2L50 22z" fill="#4FC3F7"/>' +
      "</svg>"
  );

const w = window as any;

// object URL 注册表
const urlMap: Record<string, { audio: string; cover: string | null }> = {}; // 上传曲 by id
const bcUrlMap: Record<string, string> = {}; // 内置曲封面覆盖 by name
let idCounter = 0;
// 首次 restore 时拍下内置曲快照（含运行时 CDN URL），用于“恢复内置曲目”补回
let builtinSnapshot: BuiltinDef[] | null = null;

/* ------------------------- IndexedDB ------------------------- */

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(BCOVER_STORE)) {
        db.createObjectStore(BCOVER_STORE, { keyPath: "name" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txStore(
  store: string,
  mode: IDBTransactionMode
): Promise<IDBObjectStore> {
  return openDB().then((db) => db.transaction(store, mode).objectStore(store));
}

function dbGetAll(): Promise<UploadRecord[]> {
  return txStore(STORE, "readonly").then(
    (os) =>
      new Promise<UploadRecord[]>((resolve, reject) => {
        const req = os.getAll();
        req.onsuccess = () => resolve((req.result as UploadRecord[]) || []);
        req.onerror = () => reject(req.error);
      })
  );
}

function dbGet(id: string): Promise<UploadRecord | undefined> {
  return txStore(STORE, "readonly").then(
    (os) =>
      new Promise<UploadRecord | undefined>((resolve, reject) => {
        const req = os.get(id);
        req.onsuccess = () => resolve(req.result as UploadRecord | undefined);
        req.onerror = () => reject(req.error);
      })
  );
}

function dbWrite(
  store: string,
  fn: (os: IDBObjectStore) => void
): Promise<void> {
  return openDB().then(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, "readwrite");
        fn(tx.objectStore(store));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      })
  );
}

const dbPut = (rec: UploadRecord) => dbWrite(STORE, (os) => os.put(rec));
const dbDel = (id: string) => dbWrite(STORE, (os) => os.delete(id));
const dbClear = () => dbWrite(STORE, (os) => os.clear());

function bcGetAll(): Promise<BuiltinCover[]> {
  return txStore(BCOVER_STORE, "readonly").then(
    (os) =>
      new Promise<BuiltinCover[]>((resolve, reject) => {
        const req = os.getAll();
        req.onsuccess = () => resolve((req.result as BuiltinCover[]) || []);
        req.onerror = () => reject(req.error);
      })
  );
}

const bcPut = (rec: BuiltinCover) => dbWrite(BCOVER_STORE, (os) => os.put(rec));
const bcClear = () => dbWrite(BCOVER_STORE, (os) => os.clear());

/* ------------------------- 隐藏内置名单（localStorage） ------------------------- */

function getRemovedBuiltins(): string[] {
  try {
    return JSON.parse(localStorage.getItem(LS_REMOVED) || "[]") || [];
  } catch (e) {
    return [];
  }
}

function setRemovedBuiltins(arr: string[]): void {
  try {
    localStorage.setItem(LS_REMOVED, JSON.stringify(arr));
  } catch (e) {
    /* ignore */
  }
}

/* ------------------------- 元数据 / 封面 -------------------------
 * 按容器分流：
 *   - Ogg（OggS）：jsmediatags 不支持，自写解析 Vorbis/Opus comment 的
 *     METADATA_BLOCK_PICTURE（很多 .flac 实为 Ogg Vorbis、以及 .ogg/.opus）
 *   - 其余（MP3/ID3、MP4、原生 FLAC）：交给 jsmediatags
 */

interface Tags {
  title?: string;
  artist?: string;
  coverBlob: Blob | null;
}

const _utf8Decoder =
  typeof TextDecoder !== "undefined" ? new TextDecoder("utf-8") : null;

function utf8(bytes: Uint8Array): string {
  if (_utf8Decoder) return _utf8Decoder.decode(bytes);
  let s = "";
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return s;
}

async function readTags(blob: Blob): Promise<Tags> {
  try {
    const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
    // "OggS"
    if (
      head[0] === 0x4f &&
      head[1] === 0x67 &&
      head[2] === 0x67 &&
      head[3] === 0x53
    ) {
      return await readOggTags(blob);
    }
  } catch (e) {
    /* 嗅探失败则回落到 jsmediatags */
  }
  return readWithJsmediatags(blob);
}

// jsmediatags 按需注入（仅上传时加载 53KB，其余页面不拉）
let _jsmediatagsPromise: Promise<void> | null = null;

function ensureJsmediatags(): Promise<void> {
  if (_jsmediatagsPromise) return _jsmediatagsPromise;
  if (w.jsmediatags && typeof w.jsmediatags.read === 'function') {
    _jsmediatagsPromise = Promise.resolve();
    return _jsmediatagsPromise;
  }
  _jsmediatagsPromise = new Promise((resolve) => {
    const s = document.createElement('script');
    s.src = '/lib/jsmediatags.min.js';
    s.onload = () => resolve();
    s.onerror = () => { _jsmediatagsPromise = null; resolve(); }; // 优雅降级
    document.head.appendChild(s);
  });
  return _jsmediatagsPromise;
}

async function readWithJsmediatags(blob: Blob): Promise<Tags> {
  await ensureJsmediatags();
  return new Promise((resolve) => {
    const jmt = w.jsmediatags;
    if (!jmt || typeof jmt.read !== "function") {
      resolve({ coverBlob: null });
      return;
    }
    try {
      jmt.read(blob, {
        onSuccess: (res: any) => {
          const tags = (res && res.tags) || {};
          let coverBlob: Blob | null = null;
          const pic = tags.picture;
          if (pic && pic.data && pic.data.length) {
            try {
              coverBlob = new Blob([new Uint8Array(pic.data)], {
                type: pic.format || "image/jpeg",
              });
            } catch (e) {
              coverBlob = null;
            }
          }
          resolve({ title: tags.title, artist: tags.artist, coverBlob });
        },
        onError: () => resolve({ coverBlob: null }),
      });
    } catch (e) {
      resolve({ coverBlob: null });
    }
  });
}

// 读文件前 16MB（comment header 在文件最前，封面 base64 后极少超过此值）
async function readOggTags(blob: Blob): Promise<Tags> {
  try {
    const max = Math.min(blob.size, 16 * 1024 * 1024);
    const buf = new Uint8Array(await blob.slice(0, max).arrayBuffer());
    const comment = extractCommentPacket(buf);
    if (!comment) return { coverBlob: null };
    return parseVorbisComment(comment);
  } catch (e) {
    return { coverBlob: null };
  }
}

function matchAscii(buf: Uint8Array, off: number, str: string): boolean {
  if (off + str.length > buf.length) return false;
  for (let i = 0; i < str.length; i++) {
    if (buf[off + i] !== str.charCodeAt(i)) return false;
  }
  return true;
}

function concatChunks(chunks: Uint8Array[]): Uint8Array {
  let total = 0;
  for (let i = 0; i < chunks.length; i++) total += chunks[i].length;
  const out = new Uint8Array(total);
  let o = 0;
  for (let i = 0; i < chunks.length; i++) {
    out.set(chunks[i], o);
    o += chunks[i].length;
  }
  return out;
}

function stripCommentMagic(full: Uint8Array): Uint8Array | null {
  // Vorbis comment packet: \x03 "vorbis"
  if (full.length >= 7 && full[0] === 0x03 && matchAscii(full, 1, "vorbis")) {
    return full.subarray(7);
  }
  // Opus comment packet: "OpusTags"
  if (full.length >= 8 && matchAscii(full, 0, "OpusTags")) {
    return full.subarray(8);
  }
  return null;
}

// 遍历 Ogg pages，按 lacing 重组 packets，返回注释包（去掉 magic 后的内容）
function extractCommentPacket(buf: Uint8Array): Uint8Array | null {
  let pos = 0;
  let chunks: Uint8Array[] = [];
  while (pos + 27 <= buf.length) {
    if (
      !(
        buf[pos] === 0x4f &&
        buf[pos + 1] === 0x67 &&
        buf[pos + 2] === 0x67 &&
        buf[pos + 3] === 0x53
      )
    ) {
      break; // 不在 page 边界，停止
    }
    const segCount = buf[pos + 26];
    const tableStart = pos + 27;
    if (tableStart + segCount > buf.length) break;
    let off = tableStart + segCount;
    for (let i = 0; i < segCount; i++) {
      const lacing = buf[tableStart + i];
      const end = Math.min(off + lacing, buf.length);
      chunks.push(buf.subarray(off, end));
      off = end;
      if (lacing < 255) {
        // 一个 packet 结束
        const stripped = stripCommentMagic(concatChunks(chunks));
        chunks = [];
        if (stripped) return stripped;
      }
    }
    pos = off;
  }
  // 截断时末尾仍在累积，尝试一次
  if (chunks.length) {
    const stripped = stripCommentMagic(concatChunks(chunks));
    if (stripped) return stripped;
  }
  return null;
}

function parseVorbisComment(data: Uint8Array): Tags {
  try {
    const dv = new DataView(data.buffer, data.byteOffset, data.byteLength);
    let p = 0;
    if (p + 4 > data.length) return { coverBlob: null };
    const vendorLen = dv.getUint32(p, true);
    p += 4 + vendorLen; // 跳过 vendor 字符串
    if (p + 4 > data.length) return { coverBlob: null };
    const count = dv.getUint32(p, true);
    p += 4;
    let title: string | undefined;
    let artist: string | undefined;
    let coverBlob: Blob | null = null;
    for (let i = 0; i < count; i++) {
      if (p + 4 > data.length) break;
      const len = dv.getUint32(p, true);
      p += 4;
      if (len > data.length - p) break; // 截断保护
      const c = data.subarray(p, p + len);
      p += len;
      const eq = c.indexOf(0x3d); // '='
      if (eq < 0) continue;
      const key = utf8(c.subarray(0, eq)).toUpperCase();
      if (key === "TITLE" && !title) {
        title = utf8(c.subarray(eq + 1));
      } else if (key === "ARTIST" && !artist) {
        artist = utf8(c.subarray(eq + 1));
      } else if (key === "METADATA_BLOCK_PICTURE" && !coverBlob) {
        coverBlob = parseFlacPicture(utf8(c.subarray(eq + 1)));
      }
    }
    return { title, artist, coverBlob };
  } catch (e) {
    return { coverBlob: null };
  }
}

// 解析 base64 编码的 FLAC PICTURE block（big-endian 字段）→ 图片 Blob
function parseFlacPicture(b64: string): Blob | null {
  try {
    const bin = atob(b64.replace(/\s/g, ""));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    const dv = new DataView(bytes.buffer);
    let p = 4; // 跳过 picture type
    const mimeLen = dv.getUint32(p);
    p += 4;
    if (p + mimeLen > bytes.length) return null;
    const mime = utf8(bytes.subarray(p, p + mimeLen));
    p += mimeLen;
    const descLen = dv.getUint32(p);
    p += 4 + descLen; // 跳过 description
    p += 16; // width/height/depth/colors 各 4 字节
    if (p + 4 > bytes.length) return null;
    const dataLen = dv.getUint32(p);
    p += 4;
    if (dataLen <= 0 || p + dataLen > bytes.length) return null; // 截断则放弃
    return new Blob([bytes.subarray(p, p + dataLen)], {
      type: mime || "image/jpeg",
    });
  } catch (e) {
    return null;
  }
}

/* ------------------------- 播放器接入 ------------------------- */

function isBuiltin(audio: any): boolean {
  return !audio.__uploadId;
}

function setCurrentPic(ap: any, idx: number, url: string): void {
  if (idx === ap.list.index) {
    const pic = document.querySelector(
      "#aplayer .aplayer-pic"
    ) as HTMLElement | null;
    if (pic) pic.style.backgroundImage = "url('" + url + "')";
  }
}

function addToPlayer(ap: any, rec: UploadRecord): void {
  const audio = URL.createObjectURL(rec.audioBlob);
  const cover = rec.coverBlob ? URL.createObjectURL(rec.coverBlob) : null;
  urlMap[rec.id] = { audio, cover };
  ap.list.add({
    name: rec.name,
    artist: rec.artist || "",
    url: audio,
    cover: cover || DEFAULT_COVER,
    theme: THEME,
  });
  const added = ap.list.audios[ap.list.audios.length - 1];
  if (added) {
    added.__uploadId = rec.id;
    added.__uploadSize = rec.size;
  }
}

/* ------------------------- 恢复（载入时） ------------------------- */

async function restore(ap: any): Promise<void> {
  if (!ap || !ap.list || ap.__uploadsRestored) return;
  ap.__uploadsRestored = true;
  try {
    // 1) 先拍下内置曲快照（此刻列表里只有 footer 注入的内置曲）
    if (!builtinSnapshot) {
      builtinSnapshot = (ap.list.audios || [])
        .filter((a: any) => isBuiltin(a))
        .map((a: any) => ({
          name: a.name,
          artist: a.artist || "",
          url: a.url,
          cover: a.cover,
        }));
    }

    // 2) 加回用户上传曲目
    const recs = await dbGetAll();
    recs.sort((a, b) => a.addedAt - b.addedAt);
    recs.forEach((r) => addToPlayer(ap, r));

    // 3) 应用内置曲封面覆盖
    const covers = await bcGetAll();
    covers.forEach((c) => {
      const idx = ap.list.audios.findIndex(
        (a: any) => isBuiltin(a) && a.name === c.name
      );
      if (idx >= 0) {
        if (bcUrlMap[c.name]) URL.revokeObjectURL(bcUrlMap[c.name]);
        const url = URL.createObjectURL(c.coverBlob);
        bcUrlMap[c.name] = url;
        ap.list.audios[idx].cover = url;
        setCurrentPic(ap, idx, url);
      }
    });

    // 4) 移除被隐藏的内置曲
    const removed = getRemovedBuiltins();
    removed.forEach((name) => {
      const idx = ap.list.audios.findIndex(
        (a: any) => isBuiltin(a) && a.name === name
      );
      if (idx >= 0) safeRemove(ap, idx);
    });

    dispatchChanged();
  } catch (e) {
    ap.__uploadsRestored = false;
    console.warn("[music-uploads] restore failed", e);
  }
}

/* ------------------------- 上传 ------------------------- */

function pickFiles(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.multiple = multiple;
    input.style.position = "fixed";
    input.style.left = "-9999px";
    input.addEventListener("change", () => {
      const files = input.files ? Array.prototype.slice.call(input.files) : [];
      input.remove();
      resolve(files as File[]);
    });
    document.body.appendChild(input);
    input.click();
  });
}

function isAudioFile(file: File): boolean {
  return /^audio\//.test(file.type) || AUDIO_EXT.test(file.name);
}

async function handleUpload(ap: any): Promise<void> {
  if (!ap || !ap.list) {
    toast("播放器尚未就绪");
    return;
  }
  const files = await pickFiles("audio/*", true);
  if (!files.length) return;

  let total = (await dbGetAll()).reduce((s, r) => s + r.size, 0);
  let added = 0;

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    if (!isAudioFile(file)) {
      toast("跳过非音频文件：" + file.name);
      continue;
    }
    // 单文件不单独限制，仅受总量约束：超出总量在落盘前拦下（不会进入解析/IndexedDB）
    if (total + file.size > MAX_TOTAL_BYTES) {
      toast(
        "超出上传总量上限（" +
          fmtMB(MAX_TOTAL_BYTES) +
          "），已停止：" +
          file.name
      );
      break;
    }

    const tags = await readTags(file);
    const baseName = file.name.replace(/\.[^.]+$/, "");
    const rec: UploadRecord = {
      id: genId(),
      name: (tags.title && tags.title.trim()) || baseName,
      artist: (tags.artist && tags.artist.trim()) || "",
      audioBlob: file,
      coverBlob: tags.coverBlob || null,
      mime: file.type || "audio/mpeg",
      size: file.size,
      addedAt: Date.now(),
    };

    try {
      await dbPut(rec);
    } catch (e) {
      toast("保存失败（存储空间可能已满）：" + file.name);
      continue;
    }
    addToPlayer(ap, rec);
    total += file.size;
    added++;
  }

  if (added) {
    dispatchChanged();
    toast("已添加 " + added + " 首");
  }
  renderPanel(ap);
}

/* ------------------------- 删除 / 换封面 / 恢复 ------------------------- */

// APlayer 至少保留 1 首：长度为 1 时 remove 是 no-op，这里包一层避免误判
function safeRemove(ap: any, idx: number): boolean {
  if (ap.list.audios.length <= 1) return false;
  try {
    ap.list.remove(idx);
    return true;
  } catch (e) {
    return false;
  }
}

async function removeTrack(ap: any, audio: any): Promise<void> {
  const idx = ap.list.audios.indexOf(audio);
  if (idx < 0) return;

  if (ap.list.audios.length <= 1) {
    toast("至少保留一首曲目");
    return;
  }

  if (isBuiltin(audio)) {
    const name = audio.name;
    if (safeRemove(ap, idx)) {
      const removed = getRemovedBuiltins();
      if (removed.indexOf(name) < 0) {
        removed.push(name);
        setRemovedBuiltins(removed);
      }
      if (bcUrlMap[name]) {
        URL.revokeObjectURL(bcUrlMap[name]);
        delete bcUrlMap[name];
      }
    }
  } else {
    const id = audio.__uploadId;
    if (safeRemove(ap, idx)) {
      try {
        await dbDel(id);
      } catch (e) {
        /* ignore */
      }
      revoke(id);
    }
  }
  dispatchChanged();
  renderPanel(ap);
}

async function changeCover(ap: any, audio: any): Promise<void> {
  const files = await pickFiles("image/*", false);
  if (!files.length) return;
  const img = files[0];
  if (!/^image\//.test(img.type)) {
    toast("请选择图片文件");
    return;
  }

  if (isBuiltin(audio)) {
    const name = audio.name;
    try {
      await bcPut({ name, coverBlob: img });
    } catch (e) {
      toast("封面保存失败（存储空间可能已满）");
      return;
    }
    if (bcUrlMap[name]) URL.revokeObjectURL(bcUrlMap[name]);
    const url = URL.createObjectURL(img);
    bcUrlMap[name] = url;
    const idx = ap.list.audios.indexOf(audio);
    if (idx >= 0) {
      ap.list.audios[idx].cover = url;
      setCurrentPic(ap, idx, url);
    }
  } else {
    const id = audio.__uploadId;
    const rec = await dbGet(id);
    if (!rec) return;
    rec.coverBlob = img;
    try {
      await dbPut(rec);
    } catch (e) {
      toast("封面保存失败（存储空间可能已满）");
      return;
    }
    const old = urlMap[id];
    if (old && old.cover) URL.revokeObjectURL(old.cover);
    const url = URL.createObjectURL(img);
    urlMap[id] = { audio: old ? old.audio : URL.createObjectURL(rec.audioBlob), cover: url };
    const idx = ap.list.audios.indexOf(audio);
    if (idx >= 0) {
      ap.list.audios[idx].cover = url;
      setCurrentPic(ap, idx, url);
    }
  }
  dispatchChanged();
  renderPanel(ap);
  toast("封面已更新");
}

async function clearUploads(ap: any): Promise<void> {
  const recs = await dbGetAll();
  for (let i = 0; i < recs.length; i++) {
    const idx = ap.list.audios.findIndex(
      (a: any) => a.__uploadId === recs[i].id
    );
    if (idx >= 0) safeRemove(ap, idx);
    revoke(recs[i].id);
  }
  try {
    await dbClear();
  } catch (e) {
    /* ignore */
  }
  dispatchChanged();
  renderPanel(ap);
  toast("已清空上传曲目");
}

async function restoreDefaults(ap: any): Promise<void> {
  // 清隐藏名单
  setRemovedBuiltins([]);
  // 清内置封面覆盖
  try {
    await bcClear();
  } catch (e) {
    /* ignore */
  }
  Object.keys(bcUrlMap).forEach((name) => {
    URL.revokeObjectURL(bcUrlMap[name]);
    delete bcUrlMap[name];
  });
  // 按快照补回缺失的内置曲、复原现存内置曲封面
  if (builtinSnapshot) {
    builtinSnapshot.forEach((def) => {
      const idx = ap.list.audios.findIndex(
        (a: any) => isBuiltin(a) && a.name === def.name
      );
      if (idx < 0) {
        ap.list.add({
          name: def.name,
          artist: def.artist,
          url: def.url,
          cover: def.cover,
          theme: THEME,
        });
      } else {
        ap.list.audios[idx].cover = def.cover;
        setCurrentPic(ap, idx, def.cover);
      }
    });
  }
  dispatchChanged();
  renderPanel(ap);
  toast("已恢复内置曲目");
}

async function storageInfo(): Promise<{ count: number; used: number; cap: number }> {
  const recs = await dbGetAll();
  const used = recs.reduce((s, r) => s + r.size, 0);
  return { count: recs.length, used, cap: MAX_TOTAL_BYTES };
}

/* ------------------------- 工具 ------------------------- */

function genId(): string {
  idCounter++;
  return "up-" + Date.now() + "-" + idCounter;
}

function revoke(id: string): void {
  const u = urlMap[id];
  if (u) {
    URL.revokeObjectURL(u.audio);
    if (u.cover) URL.revokeObjectURL(u.cover);
    delete urlMap[id];
  }
}

function fmtMB(bytes: number): string {
  if (bytes >= 1024 * 1024 * 1024) {
    return (bytes / 1024 / 1024 / 1024).toFixed(2) + "GB";
  }
  return (bytes / 1024 / 1024).toFixed(1) + "MB";
}

function dispatchChanged(): void {
  window.dispatchEvent(new CustomEvent("music-uploads-changed"));
}

let toastTimer: any = null;
function toast(msg: string): void {
  let el = document.querySelector(".mu-toast") as HTMLElement | null;
  if (!el) {
    el = document.createElement("div");
    el.className = "mu-toast";
    document.documentElement.appendChild(el);
  }
  el.textContent = msg;
  el.classList.add("show");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    if (el) el.classList.remove("show");
  }, 2600);
}

function uploadBarHTML(): string {
  return (
    '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">' +
    '<line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>' +
    "<span>上传音乐</span>"
  );
}

/* ------------------------- 管理面板 ------------------------- */

let panelEl: HTMLElement | null = null;
let currentAp: any = null;

function ensurePanel(): HTMLElement {
  if (panelEl) {
    // Swup 容器替换等情况下面板可能被移出 DOM，重新挂回 <html>
    if (!panelEl.isConnected) document.documentElement.appendChild(panelEl);
    return panelEl;
  }
  const overlay = document.createElement("div");
  overlay.className = "mu-overlay";
  overlay.style.display = "none";
  overlay.innerHTML =
    '<div class="mu-panel">' +
    '<div class="mu-panel-head"><span>我的音乐</span><button class="mu-close" type="button" title="关闭">&times;</button></div>' +
    '<button class="mu-add-btn" type="button">' +
    uploadBarHTML().replace("上传音乐", "选择音频文件上传") +
    "</button>" +
    '<div class="mu-usage"><div class="mu-usage-bar"><div class="mu-usage-fill"></div></div><div class="mu-usage-text"></div></div>' +
    '<div class="mu-list"></div>' +
    '<div class="mu-foot"><button class="mu-restore" type="button">恢复内置曲目</button><button class="mu-clear" type="button">清空上传</button></div>' +
    "</div>";

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) closePanel();
  });
  (overlay.querySelector(".mu-close") as HTMLElement).addEventListener(
    "click",
    closePanel
  );
  (overlay.querySelector(".mu-add-btn") as HTMLElement).addEventListener(
    "click",
    () => {
      if (currentAp) handleUpload(currentAp);
    }
  );
  (overlay.querySelector(".mu-restore") as HTMLElement).addEventListener(
    "click",
    () => {
      if (currentAp) restoreDefaults(currentAp);
    }
  );
  (overlay.querySelector(".mu-clear") as HTMLElement).addEventListener(
    "click",
    () => {
      if (currentAp && window.confirm("确定清空所有上传的曲目？")) {
        clearUploads(currentAp);
      }
    }
  );

  // 挂到 <html> 而非 <body>，与本站 #aplayer 同样的做法：
  // 避免被阅读器/Swup 容器的层叠上下文困住，保证面板永远在最上层。
  document.documentElement.appendChild(overlay);
  panelEl = overlay;
  return overlay;
}

async function renderPanel(ap: any): Promise<void> {
  if (!panelEl || panelEl.style.display === "none") return;
  const info = await storageInfo();
  const audios: any[] = ap && ap.list && ap.list.audios ? ap.list.audios : [];
  const list = panelEl.querySelector(".mu-list") as HTMLElement;
  list.innerHTML = "";

  if (!audios.length) {
    list.innerHTML = '<div class="mu-empty">列表为空</div>';
  } else {
    audios.forEach((audio) => {
      const builtin = isBuiltin(audio);
      const item = document.createElement("div");
      item.className = "mu-item";
      item.innerHTML =
        '<img class="mu-item-cover" alt="">' +
        '<div class="mu-item-meta"><div class="mu-item-name"></div><div class="mu-item-sub"></div></div>' +
        '<button class="mu-item-btn mu-item-del" type="button" title="删除">删除</button>';
      (item.querySelector(".mu-item-cover") as HTMLImageElement).src =
        audio.cover || DEFAULT_COVER;
      (item.querySelector(".mu-item-name") as HTMLElement).textContent =
        audio.name || "";
      const sub = builtin
        ? audio.artist || "内置曲目"
        : (audio.artist ? audio.artist + " · " : "") +
          (audio.__uploadSize ? fmtMB(audio.__uploadSize) : "");
      (item.querySelector(".mu-item-sub") as HTMLElement).textContent = sub;
      (item.querySelector(".mu-item-del") as HTMLElement).addEventListener(
        "click",
        () => removeTrack(ap, audio)
      );
      list.appendChild(item);
    });
  }

  const fill = panelEl.querySelector(".mu-usage-fill") as HTMLElement;
  const pct = info.cap ? Math.min(100, (info.used / info.cap) * 100) : 0;
  fill.style.width = pct + "%";
  (panelEl.querySelector(".mu-usage-text") as HTMLElement).textContent =
    "上传已用 " +
    fmtMB(info.used) +
    " / " +
    fmtMB(info.cap) +
    "（共 " +
    audios.length +
    " 首，含上传 " +
    info.count +
    " 首）";
}

function openPanel(ap: any): void {
  currentAp = ap || w.aplayerInstance;
  ensurePanel();
  panelEl!.style.display = "flex";
  renderPanel(currentAp);
}

function closePanel(): void {
  if (panelEl) panelEl.style.display = "none";
}

/* ------------------------- 主页 .aplayer-list 注入入口 ------------------------- */

function attachToAplayerList(ap: any): void {
  const list = document.querySelector("#aplayer .aplayer-list");
  if (!list || list.querySelector(".mu-upload-bar")) return;
  const bar = document.createElement("div");
  bar.className = "mu-upload-bar";
  bar.innerHTML = uploadBarHTML();
  bar.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    openPanel(ap);
  });
  list.insertBefore(bar, list.firstChild);
}

/* ------------------------- 对外 API ------------------------- */

w.__musicUploads = {
  restore: restore,
  openPanel: openPanel,
  closePanel: closePanel,
  handleUpload: handleUpload,
  removeTrack: removeTrack,
  changeCover: changeCover,
  clearUploads: clearUploads,
  restoreDefaults: restoreDefaults,
  storageInfo: storageInfo,
  attachToAplayerList: attachToAplayerList,
  uploadBarHTML: uploadBarHTML,
};

/* ------------------------- 自启动 ------------------------- */

// 等待共享 APlayer 实例就绪（沿用站点 30~50ms 轮询 idiom），
// 恢复上传曲目/内置自定义并在主页歌单注入“上传音乐”入口。幂等。
(function boot() {
  let tries = 0;
  const timer = setInterval(() => {
    tries++;
    const ap = w.aplayerInstance;
    if (ap && ap.list) {
      clearInterval(timer);
      restore(ap);
      attachToAplayerList(ap);
    } else if (tries > 200) {
      clearInterval(timer); // ~10s 仍无实例则放弃（该页可能没有播放器）
    }
  }, 50);
})();

// 页面卸载时回收所有 object URL，避免内存泄漏
window.addEventListener("pagehide", () => {
  Object.keys(urlMap).forEach((id) => revoke(id));
  Object.keys(bcUrlMap).forEach((name) => {
    URL.revokeObjectURL(bcUrlMap[name]);
    delete bcUrlMap[name];
  });
});
