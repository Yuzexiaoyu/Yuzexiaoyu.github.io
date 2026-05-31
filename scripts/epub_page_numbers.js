// Format page numbers at the start of preface pages as biaoti1
// Revert false positives from previous run first, then re-apply with stricter rules

const fs = require('fs');
const path = require('path');

const TEXT_DIR = process.argv[2] || '/tmp/formula_epub/extracted_final/OEBPS/Text';

if (!fs.existsSync(TEXT_DIR)) {
  console.error('Text dir not found: ' + TEXT_DIR);
  process.exit(1);
}

const pCFiles = [];
for (let i = 18; i <= 166; i++) {
  const name = 'pC' + String(i).padStart(3, '0') + '.xhtml';
  if (fs.existsSync(path.join(TEXT_DIR, name))) pCFiles.push(name);
}

let formatted = 0;

for (const f of pCFiles) {
  const filePath = path.join(TEXT_DIR, f);
  let content = fs.readFileSync(filePath, 'utf-8');

  // --- STEP 0: Revert ALL biaoti1 tags back to plain <p> ---
  // This undoes any false positives from the previous run
  content = content.replace(/<p class="biaoti1">([^<]+)<\/p>/g, '<p>$1</p>');
  // Remove <br/> spacers that were added between biaoti1 and next p
  content = content.replace(/<p><br \/><\/p>\n\s*<p>/g, '<p>');

  // --- STEP 1: Standalone page numbers ---
  // <p>22</p> or <p>50</p> — these are always page markers
  content = content.replace(/<p>(\d{2,3})<\/p>/g, function(match, num) {
    const n = parseInt(num);
    if (n >= 20 && n <= 200) {
      return '<p class="biaoti1">' + num + '</p>';
    }
    return match;
  });

  // --- STEP 2: Number at very start of paragraph ---
  // Match: <p>20 followed by space and meaningful text
  // BUT not if followed by "岁", "期", "号", "（", "～"
  content = content.replace(/<p>(\d{2,3})\s+(?!岁|期|号|（|～)/g, function(match, num) {
    const n = parseInt(num);
    if (n >= 20 && n <= 200) {
      return '<p class="biaoti1">' + num + '</p>\n<p><br /></p>\n    <p>';
    }
    return match;
  });

  // --- STEP 3: Number at end of paragraph (flow chart pages) ---
  // Only handle cases where the number is preceded by specific markers
  // like "LOAD " or "第二章 " or "第三章 " or "　 ..."
  content = content.replace(/<p>(.*)(LOAD|第二章|第三章|第四章|第五章|第六章|True\s*End)\s+(\d{2,3})\s*<\/p>/g,
    function(match, before, marker, num) {
      const n = parseInt(num);
      if (n >= 20 && n <= 200) {
        return '<p>' + before + marker + '</p>\n    <p class="biaoti1">' + num + '</p>';
      }
      return match;
    }
  );
  // Also handle "... </p><p>XX</p>" where XX is standalone that we already handled
  // This handles cases like "... 第一章 待续</p>" followed by <p>110</p>
  // (already handled by standalone case above)

  // --- STEP 4: Page number embedded in middle (specific context) ---
  // Handle "阵营 24 ﹃..." or "阵营 24 某人" patterns
  // These are where a page number separates content sections
  // Pattern: text ending with common terms like "阵营", then number 20-200, then meaningful text
  content = content.replace(/<p>(.*?[阵营介绍])\s+(\d{2,3})\s+(﹃|[^\d\s]{2,})/g,
    function(match, before, num, after) {
      const n = parseInt(num);
      // Only if the before part doesn't end with "～", "第", "年龄" etc
      if (n >= 20 && n <= 200 && !/～$|第$|年龄$/.test(before)) {
        return '<p>' + before + '</p>\n    <p class="biaoti1">' + num +
          '</p>\n<p><br /></p>\n    <p>' + after;
      }
      return match;
    }
  );

  // --- Cleanup: remove duplicate <br/> spacers ---
  content = content.replace(/(<p><br \/><\/p>\n)\1+/g, '$1');

  if (content !== fs.readFileSync(filePath, 'utf-8')) {
    fs.writeFileSync(filePath, content);
    formatted++;
  }
}

console.log('Formatted ' + formatted + ' files');