#!/usr/bin/env python3
import sys
from pathlib import Path
from bs4 import BeautifulSoup

def replace_links(html_file, new_domain):
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        changed = False
        
        # 处理图片
        for img in soup.find_all('img'):
            src = img.get('src', '').strip()
            if 'yuzexiaoyu.space' in src:
                img['src'] = src.replace('yuzexiaoyu.space', new_domain.replace('https://', '').replace('http://', ''))
                changed = True
        
        # 处理音频
        for audio in soup.find_all('audio'):
            src = audio.get('src', '').strip()
            if 'yuzexiaoyu.space' in src:
                audio['src'] = src.replace('yuzexiaoyu.space', new_domain.replace('https://', '').replace('http://', ''))
                changed = True
            # 处理 <source> 标签
            for source in audio.find_all('source'):
                src = source.get('src', '').strip()
                if 'yuzexiaoyu.space' in src:
                    source['src'] = src.replace('yuzexiaoyu.space', new_domain.replace('https://', '').replace('http://', ''))
                    changed = True
        
        # 处理视频
        for video in soup.find_all('video'):
            src = video.get('src', '').strip()
            if 'yuzexiaoyu.space' in src:
                video['src'] = src.replace('yuzexiaoyu.space', new_domain.replace('https://', '').replace('http://', ''))
                changed = True
            # 处理 <source> 标签
            for source in video.find_all('source'):
                src = source.get('src', '').strip()
                if 'yuzexiaoyu.space' in src:
                    source['src'] = src.replace('yuzexiaoyu.space', new_domain.replace('https://', '').replace('http://', ''))
                    changed = True
        
        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
        return changed
    except Exception as e:
        print(f"❌ Error: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python replace-links.py <public_dir> <new_domain>")
        sys.exit(1)
    
    public_dir = Path(sys.argv[1])
    new_domain = sys.argv[2].rstrip('/')
    
    print(f"🔍 Replacing links to: {new_domain}")
    count = 0
    for html_file in public_dir.rglob('*.html'):
        if replace_links(html_file, new_domain):
            count += 1
    
    print(f"\n✨ Done! Modified {count} files")