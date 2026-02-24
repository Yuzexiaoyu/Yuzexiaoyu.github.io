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
        new_domain = new_domain.rstrip('/')
        
        # 处理所有资源标签
        for tag in soup.find_all(['img', 'audio', 'video', 'source', 'track']):
            for attr in ['src', 'poster']:
                if attr in tag.attrs:
                    url = tag[attr].strip()
                    if not url or url.startswith(('http://', 'https://', '//', 'data:')):
                        # 跳过外部链接和 data URL
                        if 'cdn.yuzexiaoyu.space' in url:
                            continue  # 已是 CDN 链接，跳过
                        continue
                    
                    # ✅ 关键修复：匹配相对路径（/p/... 或 /image/...）
                    if url.startswith('/p/') or url.startswith('/image/'):
                        tag[attr] = new_domain + url
                        changed = True
                        print(f"✅ [{attr}] {url} → {new_domain}{url}")
                    # 匹配主域名链接
                    elif old_domain in url:
                        tag[attr] = url.replace(old_domain, new_domain.replace('https://', '').replace('http://', ''))
                        changed = True
                        print(f"✅ [{attr}] {url} → {tag[attr]}")
        
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
    
    print(f"🔍 Replacing to: {new_domain}")
    count = 0
    for html_file in public_dir.rglob('*.html'):
        if replace_links(html_file, new_domain):
            count += 1
    
    print(f"\n✨ Done! Modified {count} files")