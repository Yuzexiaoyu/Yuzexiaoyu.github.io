// Clean up section headers, page numbers, and footers from converted XHTML files
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

let cleaned = 0;

for (const f of pCFiles) {
  const filePath = path.join(TEXT_DIR, f);
  let content = fs.readFileSync(filePath, 'utf-8');
  let modified = false;

  // 1. Remove standalone <h2> with "第N部" labels
  if (/<h2[^>]*>第[０-９0-9]+部(\s|\S)*?<\/h2>/.test(content)) {
    content = content.replace(/<h2[^>]*>第[０-９0-9]+部(\s|\S)*?<\/h2>\s*/g, '');
    modified = true;
  }

  // 2. Remove standalone <h3> with "第N部" labels
  if (/<h3[^>]*>第[０-９0-9]+部(\s|\S)*?<\/h3>/.test(content)) {
    content = content.replace(/<h3[^>]*>第[０-９0-9]+部(\s|\S)*?<\/h3>\s*/g, '');
    modified = true;
  }

  // 3. Remove <p> with ONLY "Stories", "Characters", "Title", "Prologue", "Epilogue"
  content = content.replace(/<p>Stories<\/p>\s*/g, '');
  content = content.replace(/<p>Characters<\/p>\s*/g, '');
  content = content.replace(/<p>Title<\/p>\s*/g, '');
  content = content.replace(/<p>Prologue<\/p>\s*/g, '');
  content = content.replace(/<p>Epilogue<\/p>\s*/g, '');

  // 4. Remove <p> that starts with "故事介绍 \d+ Stories"
  content = content.replace(/<p>故事介绍\s*\d+\s*Stories<\/p>\s*/g, '');

  // 5. Remove <p> that starts with "人物介绍 \d+"
  content = content.replace(/<p>人物介绍\s*\d+<\/p>\s*/g, '');

  // 6. Remove "故事介绍 \d+ Stories" from WITHIN longer <p> tags
  content = content.replace(/故事介绍\s*\d+\s*Stories\s*/g, '');
  // Also handle the format like "故事介绍 97" without Stories
  content = content.replace(/故事介绍\s*\d+/g, '');

  // 7. Remove "第2部　故事介绍 99" patterns from within text
  content = content.replace(/第[０-９0-9]+部[　\s]*故事介绍[　\s]*\d*[　\s]*/g, '');

  // 8. Remove "人物介绍 \d+" from within longer <p> tags
  content = content.replace(/人物介绍\s*\d+\s*/g, '');

  // 9. Remove standalone "第2部" from end of <p> tags
  content = content.replace(/\s*第[０-９0-9]+部\s*<\/p>/g, '</p>');

  // 10. Remove lone "第N部" (with optional extra chars) at end of paragraphs
  content = content.replace(/\s*第[０-９0-9]+部\s*$/gm, '');

  // 11. Remove "Stories" from end of <p> tags
  content = content.replace(/\s*Stories\s*<\/p>/g, '</p>');

  // 12. Remove "Characters" from end of <p> tags
  content = content.replace(/\s*Characters\s*<\/p>/g, '</p>');

  // 13. Clean up empty <p> tags
  content = content.replace(/<p>\s*<\/p>\s*/g, '');

  // 14. Clean up empty h2/h3 tags
  content = content.replace(/<h2[^>]*>\s*<\/h2>\s*/g, '');
  content = content.replace(/<h3[^>]*>\s*<\/h3>\s*/g, '');

  // 15. Clean adjacent <br/> between or around deleted elements
  content = content.replace(/<p><br\s*\/><\/p>\s*<p><br\s*\/><\/p>/g, '<p><br /></p>');

  if (content !== fs.readFileSync(filePath, 'utf-8')) {
    fs.writeFileSync(filePath, content);
    cleaned++;
  }
}

console.log('Cleaned ' + cleaned + ' files');