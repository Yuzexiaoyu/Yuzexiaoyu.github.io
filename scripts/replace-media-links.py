#!/usr/bin/env python3
import sys
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import quote

def replace_links(html_file, new_domain, public_dir):
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        changed = False
        new_domain = new_domain.rstrip('/')
        
        # ✅ 关键修复：精确提取相对于 public/ 的路径
        # 例如: public/p/短代码/index.html → p/短代码
        try:
            rel_path = html_file.relative_to(public_dir)
            page_dir = str(rel_path.parent).replace('\\', '/')
            # 确保路径以 / 开头（用于拼接）
            if page_dir and not page_dir.startswith('/'):
                page_dir = '/' + page_dir
        except Exception as e:
            page_dir = ''
            print(f"⚠️ 路径提取失败 {html_file.name}: {e}")
        
        # 处理所有带src属性的标签（img, audio, video, source, track）
        for tag in soup.find_all(['img', 'audio', 'video', 'source', 'track']):
            src = tag.get('src', '').strip()
            if not src:
                continue
            
            # ✅ 情况1: 相对路径 ./xxx → 转换为 CDN 绝对路径（保留 /p/ 前缀）
            if src.startswith('./'):
                filename = src[2:]  # 去掉"./"
                # 新增：处理 static/music 路径，直接使用根路径
                if filename.startswith('static/music/'):
                    abs_path = f"/{filename}"
                    tag['src'] = f"{new_domain}{abs_path}"
                    changed = True
                    print(f"✅ static/music相对路径: {src} → {tag['src']}")
                else:
                    if page_dir:
                        # 关键：确保路径格式为 /p/文章目录/文件名
                        abs_path = f"{page_dir}/{filename}"
                        tag['src'] = f"{new_domain}{abs_path}"
                        changed = True
                        print(f"✅ 相对路径: {src} → {tag['src']}")
                    else:
                        # 根目录情况（极少）
                        tag['src'] = f"{new_domain}/{filename}"
                        changed = True
                        print(f"✅ 根目录相对路径: {src} → {tag['src']}")
            
            # ✅ 情况2: 包含 yuzexiaoyu.space 的链接 → 替换域名
            elif 'yuzexiaoyu.space' in src:
                new_host = new_domain.replace('https://', '').replace('http://', '').rstrip('/')
                tag['src'] = src.replace('yuzexiaoyu.space', new_host)
                changed = True
                print(f"✅ 域名替换: {src[:50]}... → {tag['src'][:50]}...")
        
        # 处理 poster 属性（video封面图）
        for video in soup.find_all('video'):
            poster = video.get('poster', '').strip()
            if not poster:
                continue
            
            # ✅ 情况1: 相对路径 ./xxx
            if poster.startswith('./'):
                filename = poster[2:]
                # 新增：处理 static/music 路径，直接使用根路径
                if filename.startswith('static/music/'):
                    abs_path = f"/{filename}"
                    video['poster'] = f"{new_domain}{abs_path}"
                    changed = True
                    print(f"✅ poster static/music路径: {poster} → {video['poster']}")
                else:
                    if page_dir:
                        abs_path = f"{page_dir}/{filename}"
                        video['poster'] = f"{new_domain}{abs_path}"
                        changed = True
                        print(f"✅ poster相对路径: {poster} → {video['poster']}")
                    else:
                        video['poster'] = f"{new_domain}/{filename}"
                        changed = True
                        print(f"✅ poster根目录: {poster} → {video['poster']}")
            
            # ✅ 情况2: 包含 yuzexiaoyu.space 的链接
            elif 'yuzexiaoyu.space' in poster:
                new_host = new_domain.replace('https://', '').replace('http://', '').rstrip('/')
                video['poster'] = poster.replace('yuzexiaoyu.space', new_host)
                changed = True
                print(f"✅ poster域名替换: {poster[:50]}... → {video['poster'][:50]}...")
        
        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
        return changed
    except Exception as e:
        print(f"❌ Error in {html_file.name}: {e}")
        return False

if __name__ == '__main__':
    if len(sys.argv) < 3:
        print("Usage: python replace-media-links.py <public_dir> <new_domain>")
        sys.exit(1)
    
    public_dir = Path(sys.argv[1])
    new_domain = sys.argv[2].rstrip('/')
    
    print(f"🔍 Replacing links to: {new_domain}")
    print(f"   Public dir: {public_dir.absolute()}")
    count = 0
    for html_file in public_dir.rglob('*.html'):
        if replace_links(html_file, new_domain, public_dir):
            count += 1
    
    print(f"\n✨ Done! Modified {count} files")
