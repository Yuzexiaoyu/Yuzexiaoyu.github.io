#!/usr/bin/env python3
import sys
from pathlib import Path
from bs4 import BeautifulSoup

def replace_links(html_file, new_domain):
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        changed = False
        for img in soup.find_all('img'):
            src = img.get('src', '').strip()
            
            # 匹配 yuzexiaoyu.space 域名的图片
            if 'yuzexiaoyu.space' in src:
                new_src = src.replace('yuzexiaoyu.space', new_domain.replace('https://', '').replace('http://', ''))
                img['src'] = new_src
                changed = True
                print(f"✅ {src} → {new_src}")
        
        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
        return changed
    except Exception as e:
        print(f"❌ Error processing {html_file}: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python replace-img-links.py <public_dir> <new_domain>")
        sys.exit(1)
    
    public_dir = Path(sys.argv[1])
    new_domain = sys.argv[2].rstrip('/')
    
    print(f"🔍 Replacing image links to: {new_domain}")
    count = 0
    for html_file in public_dir.rglob('*.html'):
        if replace_links(html_file, new_domain):
            count += 1
    
    print(f"\n✨ Done! Modified {count} files")