#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
替换 HTML 文件中的图片链接为 R2 URL（支持 URL 编码路径）
"""
import os
import sys
import urllib.parse
from pathlib import Path
from bs4 import BeautifulSoup

# 支持的图片扩展名
IMAGE_EXTS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg', '.bmp', '.ico'}

def is_image_file(path):
    """判断是否为图片文件"""
    return path.suffix.lower() in IMAGE_EXTS

def get_all_html_files(directory):
    """获取目录下所有 HTML 文件"""
    html_files = []
    for root, _, files in os.walk(directory):
        for file in files:
            if file.endswith('.html'):
                html_files.append(Path(root) / file)
    return html_files

def replace_image_links(html_file, public_dir, base_url):
    """替换 HTML 文件中的图片链接"""
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            html_content = f.read()
        
        soup = BeautifulSoup(html_content, 'html.parser')
        changed = False
        
        for img in soup.find_all('img'):
            src = img.get('src', '').strip()
            
            # 跳过空链接和外部链接
            if not src or src.startswith(('http://', 'https://', '//', 'data:')):
                continue
            
            # 处理相对路径（./ 或 ../）
            if src.startswith(('./', '../')):
                # 转换为绝对路径（基于 HTML 文件位置）
                html_rel_path = html_file.relative_to(public_dir)
                abs_path = (Path(public_dir) / html_rel_path.parent / src).resolve()
                rel_to_public = abs_path.relative_to(Path(public_dir).resolve())
                normalized_src = '/' + rel_to_public.as_posix()
            else:
                # 处理绝对路径（/ 开头）
                normalized_src = src if src.startswith('/') else '/' + src
            
            # 尝试两种路径：原始编码路径 + 解码后路径
            candidates = [
                Path(public_dir) / normalized_src.lstrip('/'),
                Path(public_dir) / urllib.parse.unquote(normalized_src.lstrip('/'))
            ]
            
            for local_path in candidates:
                if local_path.exists() and is_image_file(local_path):
                    new_src = base_url.rstrip('/') + normalized_src
                    img['src'] = new_src
                    changed = True
                    print(f"✅ {html_file.relative_to(Path.cwd())}: {normalized_src} → {new_src}")
                    break
            else:
                # 调试：打印未匹配的图片
                print(f"⚠️  未找到本地文件: {normalized_src} (尝试路径: {candidates[0]}, {candidates[1]})")
        
        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
        
        return changed
    
    except Exception as e:
        print(f"❌ 处理文件 {html_file} 时出错: {e}")
        return False

def main():
    if len(sys.argv) < 3:
        print("用法: python replace-img-links.py <public_dir> <r2_base_url>")
        print("示例: python replace-img-links.py public https://yuzexiaoyu.8af8989ece65309e48121cc872681506.r2.cloudflarestorage.com")
        sys.exit(1)
    
    public_dir = sys.argv[1]
    r2_base_url = sys.argv[2].rstrip('/')
    
    if not Path(public_dir).exists():
        print(f"❌ 目录不存在: {public_dir}")
        sys.exit(1)
    
    print(f"🔍 扫描目录: {public_dir}")
    
    html_files = get_all_html_files(public_dir)
    print(f"📄 找到 {len(html_files)} 个 HTML 文件")
    
    changed_count = 0
    for html_file in html_files:
        if replace_image_links(html_file, public_dir, r2_base_url):
            changed_count += 1
    
    print(f"\n✨ 完成！共修改 {changed_count} 个文件")
    print(f"🔗 R2 基础 URL: {r2_base_url}")

if __name__ == '__main__':
    main()