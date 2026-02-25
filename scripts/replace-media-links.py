#!/usr/bin/env python3
import sys
from pathlib import Path
from bs4 import BeautifulSoup

def replace_links(html_file, new_domain):
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        changed = False
        old_domain = "yuzexiaoyu.space"
        new_host = new_domain.replace('https://', '').replace('http://', '').rstrip('/')
        
        # 处理所有带 src 属性的标签
        for tag in soup.find_all(['img', 'audio', 'video', 'source', 'track']):
            src = tag.get('src', '').strip()
            if old_domain in src:
                tag['src'] = src.replace(old_domain, new_host)
                changed = True
                print(f"✅ {src[:60]}... → {tag['src'][:60]}...")
        
        # 处理 poster 属性（video 封面图）
        for tag in soup.find_all('video'):
            poster = tag.get('poster', '').strip()
            if old_domain in poster:
                tag['poster'] = poster.replace(old_domain, new_host)
                changed = True
                print(f"✅ poster: {poster[:60]}... → {tag['poster'][:60]}...")
        
        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
        return changed
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python replace-media-links.py <public_dir> <new_domain>")
        sys.exit(1)
    
    public_dir = Path(sys.argv[1])
    new_domain = sys.argv[2].rstrip('/')
    
    print(f"🔍 Replacing yuzexiaoyu.space → {new_domain}")
    count = 0
    for html_file in public_dir.rglob('*.html'):
        if replace_links(html_file, new_domain):
            count += 1
    
    print(f"\n✨ Done! Modified {count} files")