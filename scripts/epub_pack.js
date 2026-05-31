// Create a proper EPUB file using Node.js Buffer manipulation
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC_DIR = process.argv[2] || '/tmp/formula_epub/extracted_new';
const OUT_FILE = process.argv[3] || '/tmp/formula_epub/formula_new.epub';

// CRC32 implementation
function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xEDB88320 : 0);
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

class ZipWriter {
  constructor() {
    this.entries = [];
    this.buffers = [];
    this.cdOffset = 0;
    this.bytesWritten = 0;
  }

  addFile(name, data, compress = true) {
    const nameBuf = Buffer.from(name, 'utf-8');
    const compressed = compress ? zlib.deflateRawSync(data) : data;
    const method = compress ? 8 : 0;
    const crc = crc32(data);

    const lh = Buffer.alloc(30 + nameBuf.length);
    let pos = 0;
    lh.writeUInt32LE(0x04034b50, pos); pos += 4;
    lh.writeUInt16LE(20, pos); pos += 2;
    lh.writeUInt16LE(0x0800, pos); pos += 2;
    lh.writeUInt16LE(method, pos); pos += 2;
    lh.writeUInt32LE(0, pos); pos += 4;
    lh.writeUInt32LE(crc, pos); pos += 4;
    lh.writeUInt32LE(compressed.length, pos); pos += 4;
    lh.writeUInt32LE(data.length, pos); pos += 4;
    lh.writeUInt16LE(nameBuf.length, pos); pos += 2;
    lh.writeUInt16LE(0, pos);
    nameBuf.copy(lh, 30);

    this.entries.push({ name, nameBuf, data, compressed, crc, method, offset: this.bytesWritten });
    this.buffers.push(lh, compressed);
    this.bytesWritten += lh.length + compressed.length;
  }

  finalize() {
    let cd = [];
    let cdSize = 0;
    this.cdOffset = this.bytesWritten;

    for (const entry of this.entries) {
      const cdh = Buffer.alloc(46 + entry.nameBuf.length);
      let pos = 0;
      cdh.writeUInt32LE(0x02014b50, pos); pos += 4;
      cdh.writeUInt16LE(20, pos); pos += 2;
      cdh.writeUInt16LE(20, pos); pos += 2;
      cdh.writeUInt16LE(0x0800, pos); pos += 2;
      cdh.writeUInt16LE(entry.method, pos); pos += 2;
      cdh.writeUInt32LE(0, pos); pos += 4;
      cdh.writeUInt32LE(entry.crc, pos); pos += 4;
      cdh.writeUInt32LE(entry.compressed.length, pos); pos += 4;
      cdh.writeUInt32LE(entry.data.length, pos); pos += 4;
      cdh.writeUInt16LE(entry.nameBuf.length, pos); pos += 2;
      cdh.writeUInt16LE(0, pos); pos += 2;
      cdh.writeUInt16LE(0, pos); pos += 2;
      cdh.writeUInt16LE(0, pos); pos += 2;
      cdh.writeUInt16LE(0, pos); pos += 2;
      cdh.writeUInt32LE(0, pos); pos += 4;
      cdh.writeUInt32LE(entry.offset, pos); pos += 4;
      entry.nameBuf.copy(cdh, 46);

      cd.push(cdh);
      cdSize += cdh.length;
    }

    const eocd = Buffer.alloc(22);
    let pos = 0;
    eocd.writeUInt32LE(0x06054b50, pos); pos += 4;
    eocd.writeUInt16LE(0, pos); pos += 2; // disk number
    eocd.writeUInt16LE(0, pos); pos += 2; // disk with CD
    eocd.writeUInt16LE(this.entries.length, pos); pos += 2; // entries on disk
    eocd.writeUInt16LE(this.entries.length, pos); pos += 2; // total entries
    eocd.writeUInt32LE(cdSize, pos); pos += 4; // CD size
    eocd.writeUInt32LE(this.cdOffset, pos); pos += 4; // CD offset
    eocd.writeUInt16LE(0, pos); // comment length

    return Buffer.concat([...this.buffers, ...cd, eocd]);
  }
}

// Collect all files
function collectFiles(dir, base) {
  const result = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const ent of entries) {
    const fullPath = path.join(dir, ent.name);
    const zipName = base ? base + '/' + ent.name : ent.name;
    if (ent.isDirectory()) {
      result.push(...collectFiles(fullPath, zipName));
    } else {
      result.push({ path: fullPath, name: zipName });
    }
  }
  return result;
}

const files = collectFiles(SRC_DIR, '');

// Sort: mimetype MUST be first
files.sort((a, b) => {
  if (a.name === 'mimetype') return -1;
  if (b.name === 'mimetype') return 1;
  return a.name.localeCompare(b.name);
});

console.log(`Packing ${files.length} files from ${SRC_DIR}...`);
const zw = new ZipWriter();

for (const file of files) {
  const content = fs.readFileSync(file.path);
  const compress = file.name !== 'mimetype';
  zw.addFile(file.name, content, compress);
}

const finalBuf = zw.finalize();
fs.writeFileSync(OUT_FILE, finalBuf);
console.log(`EPUB created: ${OUT_FILE} (${(finalBuf.length / 1024 / 1024).toFixed(1)} MB)`);