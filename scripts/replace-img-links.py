#!/usr/bin/env python3
# -*- coding: utf-8 -*-
import os
import sys
import urllib.parse
from pathlib import Path
from bs4 import BeautifulSoup

IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'}

def is_image_file(path):
    return path.suffix.lower() in IMAGE_EXTS

def get_all_html_files(directory):
    html_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.html'):
                html_files.append(Path(root) / file)
    return html_files

def replace_image_links(html_file, public_dir, base_url):
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            html = f.read()
        
        soup = BeautifulSoup(html, 'html.parser')
        changed = False
        
        for img in soup.find_all('img'):
            src = img.get('src', '').strip()
            if not src or src.startswith(('http://', 'https://', '//', 'data:')):
                continue
            
            # 标准化路径：确保以 / 开头
            if src.startswith('.'):
                continue  # 跳过相对路径（Hugo 应生成绝对路径）
            
            normalized_src = src if src.startswith('/') else '/' + src
            
            # 尝试解码路径匹配本地文件
            decoded_path = urllib.parse.unquote(normalized_src.lstrip('/'))
            local_path = Path(public_dir) / decoded_path
            
            if local_path.exists() and is_image_file(local_path):
                new_src = base_url.rstrip('/') + normalized_src
                img['src'] = new_src
                changed = True
                print(f"✅ {html_file.relative_to(Path.cwd())}: {normalized_src} → {new_src}")
        
        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
        return changed
    
    except Exception as e:
        print(f"❌ Error processing {html_file}: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: python replace-img-links.py <public_dir> <base_url>")
        sys.exit(1)
    
    public_dir = Path(sys.argv[1])
    base_url = sys.argv[2].rstrip('/')
    
    if not public_dir.exists():
        print(f"❌ Directory not found: {public_dir}")
        sys.exit(1)
    
    print(f"🔍 Scanning: {public_dir}")
    html_files = get_all_html_files(public_dir)
    print(f"📄 Found {len(html_files)} HTML files")
    
    changed = sum(replace_image_links(f, public_dir, base_url) for f in html_files)
    print(f"\n✨ Done! Modified {changed} files")
    print(f"🔗 Base URL: {base_url}")

if __name__ == '__main__':
    main()