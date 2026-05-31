const fs = require('fs');
const path = require('path');

// Accept paths from command line or default to /tmp paths
const BASE_DIR = process.argv[2] || '/tmp/formula_epub';
const TEXT_DIR = BASE_DIR + '/extracted/OEBPS/Text';
const OUTPUT_DIR = BASE_DIR + '/extracted_new/OEBPS/Text';
const OPF_PATH = BASE_DIR + '/extracted/OEBPS/content.opf';

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

const allFiles = fs.readdirSync(TEXT_DIR);
for (const f of allFiles) {
  const src = path.join(TEXT_DIR, f);
  const dst = path.join(OUTPUT_DIR, f);
  fs.copyFileSync(src, dst);
}

function makePageHead(title) {
  return '<?xml version="1.0" encoding="utf-8" standalone="no"?>\n' +
    '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.1//EN"\n' +
    '  "http://www.w3.org/TR/xhtml11/DTD/xhtml11.dtd">\n\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xml:lang="zh-TW"' +
    ' xmlns:epub="http://www.idpf.org/2007/ops">\n' +
    '<head>\n' +
    '  <title>' + title + '</title>\n' +
    '  <link href="../Styles/Style.css" rel="stylesheet" type="text/css" />\n' +
    '  <link href="../Styles/book-style.css" rel="stylesheet" type="text/css" />\n' +
    '</head>\n\n' +
    '<body class="zwa1">';
}

const PAGE_FOOT = '\n</body>\n</html>';

function escXml(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;')
          .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function extractText(content) {
  var regex = /<span[^>]*koboSpan[^>]*>([^<]*)<\/span>/g;
  var parts = [];
  var match;
  while ((match = regex.exec(content)) !== null) {
    if (match[1].trim()) parts.push(match[1]);
  }
  return parts;
}

function splitIntoParagraphs(text) {
  var lines = text.split(/\r?\n/).map(function(l) {
    return l.trim();
  }).filter(function(l) { return l.length > 0; });
  var allText = lines.join('\n');
  var paraSplits = allText.split(/(?=　)/);
  var paragraphs = [];
  for (var i = 0; i < paraSplits.length; i++) {
    var trimmed = paraSplits[i].trim();
    if (trimmed.length > 0) paragraphs.push(trimmed);
  }
  return paragraphs;
}

function classifyParagraph(text) {
  // Remove section headers
  if (/^第[０-９0-9]+部/.test(text)) return null;
  // Remove page number lines like "人物介绍 21" at top of pages
  if (/^人物介绍\s*\d+/.test(text)) return null;
  // Remove standalone "Characters", "Stories", "Title" footers
  if (/^(Characters|Stories|Title|Epilogue|Prologue)$/.test(text)) return null;
  // Remove footer lines like "故事介绍 97 Stories" or "第2部　故事介绍 99 Stories"
  if (/^第[０-９0-9]+部\s/.test(text)) return null;
  if (/^故事介绍\s/.test(text)) return null;
  if (/^Mission/.test(text)) return 'h3';
  if (/^〖第[０-９0-9]+集〗/.test(text)) return 'h3';
  // Filter out pure page number lines like "97" or "99 第2部　故事介绍"
  if (/^\d+\s*(Stories|第)/.test(text)) return null;
  // Filter out "98" etc at end of paragraphs - handled via stripping at end
  return 'p';
}

function getImageSrc(filename) {
  var content = fs.readFileSync(path.join(TEXT_DIR, filename), 'utf-8');
  var match = content.match(/xlink:href="([^"]+)"/);
  if (!match) match = content.match(/src="([^"]+)"/);
  return match ? match[1] : null;
}

var pCFiles = [];
for (var i = 18; i <= 166; i++) {
  var name = 'pC' + String(i).padStart(3, '0') + '.xhtml';
  if (fs.existsSync(path.join(TEXT_DIR, name))) pCFiles.push(name);
}

console.log('Found ' + pCFiles.length + ' pC files to process');

var convertedFiles = [];
var imageOnlyFiles = [];

for (var fi = 0; fi < pCFiles.length; fi++) {
  var f = pCFiles[fi];
  var content = fs.readFileSync(path.join(TEXT_DIR, f), 'utf-8');
  var hasText = content.includes('koboSpan');
  var imgSrc = getImageSrc(f);
  var hasImg = content.includes('<image ') || content.includes('<img ');
  var isImageOnly = hasImg && !hasText;

  if (isImageOnly) {
    if (imgSrc) {
      var nc = makePageHead('Re:从零开始的异世界生活公式书 Re:zeropedia') +
        '<p style="text-align: center;"><img alt="" class="fit" src="' +
        imgSrc + '" /></p>' + PAGE_FOOT;
      fs.writeFileSync(path.join(OUTPUT_DIR, f), nc);
      imageOnlyFiles.push(f);
    }
    continue;
  }

  if (!hasText) continue;

  var textParts = extractText(content);
  if (textParts.length === 0) continue;

  var imageHtml = '';
  if (imgSrc) {
    imageHtml = '<p style="text-align: center;"><img alt="" class="fit" src="' +
      imgSrc + '" /></p>\n';
  }

  var bodyContent = imageHtml;

  for (var ti = 0; ti < textParts.length; ti++) {
    var paragraphs = splitIntoParagraphs(textParts[ti]);
    if (ti > 0 && paragraphs.length > 0) {
      bodyContent += '\n<p><br /></p>\n';
    }
    for (var pi = 0; pi < paragraphs.length; pi++) {
      var para = paragraphs[pi];
      var ctype = classifyParagraph(para);
      if (ctype === null) continue;
      if (ctype === 'h2') {
        bodyContent += '\n    <h2 style="text-align: center;">' +
          escXml(para) + '</h2>\n';
      } else if (ctype === 'h3') {
        bodyContent += '\n    <h3 style="text-align: center;">' +
          escXml(para) + '</h3>\n';
      } else {
        bodyContent += '\n    <p>' + escXml(para) + '</p>\n';
      }
    }
  }

  var nc = makePageHead('Re:从零开始的异世界生活公式书 Re:zeropedia') +
    bodyContent + PAGE_FOOT;

  // Post-process: clean up section headers, footers, page numbers inline in text
  // Remove standalone footer lines like "故事介绍 97 Stories"
  nc = nc.replace(/<p>故事介绍\s*\d+\s*Stories<\/p>/g, '');
  // Remove "第2部" in <h2> tags (standalone section headers)
  nc = nc.replace(/<h2[^>]*>第[０-９0-9]+部(\s|　)/g, '<h2>').replace(/<\/h2>/g, '').replace(/<h2><\/h2>/g, '');
  // Remove "故事介绍" and "Stories" and "Characters" and "Title" standalone in <p>
  nc = nc.replace(/<p>(Stories|Characters|Title)<\/p>/g, '');
  // Remove footer pattern "第2部　故事介绍 97 Stories" anywhere in text
  nc = nc.replace(/第[０-９0-9]+部[　\s]*故事介绍[　\s]*\d+[　\s]*Stories/g, '');
  // Remove "人物介绍 23" style headers at page tops
  nc = nc.replace(/人物介绍\s*\d+/g, '');
  // Clean up empty <p></p> and empty lines
  nc = nc.replace(/<p>\s*<\/p>\n*/g, '');
  nc = nc.replace(/<h2[^>]*>\s*<\/h2>\n*/g, '');

  fs.writeFileSync(path.join(OUTPUT_DIR, f), nc);
  convertedFiles.push(f);
}

console.log('Total converted: ' + convertedFiles.length);
console.log('Image-only pages: ' + imageOnlyFiles.length);

// Update content.opf
console.log('Updating content.opf...');
var opf = fs.readFileSync(OPF_PATH, 'utf-8');

var allConverted = convertedFiles.concat(imageOnlyFiles);
for (var ci = 0; ci < allConverted.length; ci++) {
  var f = allConverted[ci];
  var baseName = path.basename(f);
  opf = opf.replace(
    new RegExp('(<item id="' + baseName.replace(/\./g, '\\.') +
      '"[^>]*?)properties="svg"\\s*', 'g'), '$1');
}

// Update spine - remove fixed-layout properties from all pC files
var spineMatch = opf.match(/<spine[^>]*>[\s\S]*?<\/spine>/);
if (spineMatch) {
  var spineSection = spineMatch[0];
  var pCBaseNames = pCFiles.map(function(f) {
    return path.basename(f);
  });

  for (var si = 0; si < pCBaseNames.length; si++) {
    var bn = pCBaseNames[si];
    var bnEsc = bn.replace(/\./g, '\\.');

    // Remove each fixed-layout property from this file's itemref
    // Use global replace on the spine section directly
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '")([^\\n>]*)(rendition:layout-pre-paginated\\s*)', 'g'),
      '$1$2');
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '")([^\\n>]*)(rendition:spread-none\\s*)', 'g'),
      '$1$2');
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '")([^\\n>]*)(rendition:page-spread-center\\s*)', 'g'),
      '$1$2');
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '")([^\\n>]*)(page-spread-left\\s*)', 'g'),
      '$1$2');
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '")([^\\n>]*)(page-spread-right\\s*)', 'g'),
      '$1$2');
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '")([^\\n>]*)(access:scroll-both\\s*)', 'g'),
      '$1$2');
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '")([^\\n>]*)(access:orientation-portrait\\s*)', 'g'),
      '$1$2');
    // Clean up empty properties=""
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '")([^\\n>]*)(properties=""\\s*)', 'g'),
      '$1$2');
    // Clean up doubled spaces
    spineSection = spineSection.replace(
      new RegExp('(idref="' + bnEsc + '"[^\\n>]*?)\\s{2,}', 'g'),
      '$1 ');
  }

  opf = opf.replace(spineMatch[0], spineSection);
}

var outputOpfDir = BASE_DIR + '/extracted_new/OEBPS';
fs.mkdirSync(outputOpfDir, { recursive: true });
fs.writeFileSync(path.join(outputOpfDir, 'content.opf'), opf);
console.log('Done! OPF updated.');