// Prepare the HTTP Brotli representation of each verified public GLB for R2.
const {createHash} = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const {brotliCompressSync, brotliDecompressSync, constants} = require('node:zlib');

const [workshopDir, outputDir, cdnPrefix] = process.argv.slice(2);
const catalogFile = path.join(workshopDir, 'catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogFile, 'utf8'));
const cdn = new URL(cdnPrefix.replace(/\/?$/, '/'));
if (cdn.protocol !== 'https:') throw new Error('Workshop model CDN must use HTTPS');

const urls = new Map();
fs.mkdirSync(outputDir, {recursive: true});
for (const {model} of catalog.entries) {
  if (!model) continue;
  if (!urls.has(model.id)) {
    if (!/^[0-9a-f]{64}$/.test(model.id) || model.url !== `/workshop/media/${model.id}.glb`) {
      throw new Error('Unexpected public GLB reference');
    }
    const source = fs.readFileSync(path.join(workshopDir, 'media', `${model.id}.glb`));
    const compressed = brotliCompressSync(source, {params: {[constants.BROTLI_PARAM_QUALITY]: 9}});
    if (!brotliDecompressSync(compressed).equals(source)) throw new Error('GLB round-trip mismatch');

    const hash = createHash('sha256').update(compressed).digest('hex');
    const filename = hash + '.glb';
    fs.writeFileSync(path.join(outputDir, filename), compressed);
    urls.set(model.id, new URL(filename, cdn).href);
    console.log(`${model.id}.glb: ${source.length} -> ${compressed.length} bytes`);
  }
  model.brotli_url = urls.get(model.id);
}
fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
