#!/usr/bin/env python3
import sys
from pathlib import Path
from bs4 import BeautifulSoup

def replace_links(html_file, base_url):
    with open(html_file, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f.read(), 'html.parser')
    changed = False
    for img in soup.find_all('img'):
        src = img.get('src', '').strip()
        if src.startswith('/p/') and not src.startswith(('http://', 'https://')):
            img['src'] = base_url.rstrip('/') + src
            changed = True
            print(f"✅ {src} → {base_url}{src}")
    if changed:
        with open(html_file, 'w', encoding='utf-8') as f:
            f.write(str(soup))
    return changed

public_dir = Path(sys.argv[1])
base_url = sys.argv[2].rstrip('/')
for html in public_dir.rglob('*.html'):
    replace_links(html, base_url)
print(f"\n✨ 完成！图片链接已替换为: {base_url}")