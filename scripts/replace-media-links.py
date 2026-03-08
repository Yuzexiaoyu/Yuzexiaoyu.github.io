#!/usr/bin/env python3
import sys
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import quote

def replace_links(html_file, new_domain, public_dir):
    """
    替换HTML文件中的媒体链接为R2 CDN地址
    - 处理/music/开头的绝对路径（播放器核心）
    - 处理./开头的相对路径（文章内媒体）
    - 处理域名替换（旧域名→R2域名）
    """
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        changed = False
        new_domain = new_domain.rstrip('/')  # 移除末尾/避免重复
        
        # 提取当前HTML文件相对于public的路径（用于拼接相对路径）
        try:
            rel_path = html_file.relative_to(public_dir)
            page_dir = str(rel_path.parent).replace('\\', '/')
            if page_dir and not page_dir.startswith('/'):
                page_dir = '/' + page_dir
        except Exception as e:
            page_dir = ''
            print(f"⚠️ 路径提取失败 {html_file.name}: {str(e)[:50]}")
        
        # 处理所有带src属性的标签（img/audio/video/source/track）
        for tag in soup.find_all(['img', 'audio', 'video', 'source', 'track']):
            src = tag.get('src', '').strip()
            if not src:
                continue
            
            # 1. 优先处理/music/开头的绝对路径（播放器音频/封面）
            if src.startswith('/music/'):
                new_src = f"{new_domain}{src}"
                tag['src'] = new_src
                changed = True
                print(f"✅ [音乐] {src} → {new_src}")
            
            # 2. 处理./开头的相对路径（文章内媒体）
            elif src.startswith('./'):
                filename = src[2:]
                if page_dir:
                    abs_path = f"{page_dir}/{filename}"
                    new_src = f"{new_domain}{abs_path}"
                else:
                    new_src = f"{new_domain}/{filename}"
                tag['src'] = new_src
                changed = True
                print(f"✅ [相对路径] {src} → {new_src}")
            
            # 3. 处理旧域名替换（兼容已有链接）
            elif 'yuzexiaoyu.space' in src:
                new_host = new_domain.replace('https://', '').replace('http://', '').rstrip('/')
                new_src = src.replace('yuzexiaoyu.space', new_host)
                tag['src'] = new_src
                changed = True
                print(f"✅ [域名替换] {src[:50]}... → {new_src[:50]}...")
        
        # 处理video的poster属性（封面图）
        for video in soup.find_all('video'):
            poster = video.get('poster', '').strip()
            if not poster:
                continue
            
            # 处理/music/开头的poster路径
            if poster.startswith('/music/'):
                new_poster = f"{new_domain}{poster}"
                video['poster'] = new_poster
                changed = True
                print(f"✅ [封面] {poster} → {new_poster}")
            
            # 处理./开头的poster相对路径
            elif poster.startswith('./'):
                filename = poster[2:]
                if page_dir:
                    abs_path = f"{page_dir}/{filename}"
                    new_poster = f"{new_domain}{abs_path}"
                else:
                    new_poster = f"{new_domain}/{filename}"
                video['poster'] = new_poster
                changed = True
                print(f"✅ [封面相对路径] {poster} → {new_poster}")
            
            # 处理旧域名的poster链接
            elif 'yuzexiaoyu.space' in poster:
                new_host = new_domain.replace('https://', '').replace('http://', '').rstrip('/')
                new_poster = poster.replace('yuzexiaoyu.space', new_host)
                video['poster'] = new_poster
                changed = True
                print(f"✅ [封面域名替换] {poster[:50]}... → {new_poster[:50]}...")
        
        # 保存修改后的文件
        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
        return changed

if __name__ == '__main__':
    # 检查参数
    if len(sys.argv) < 3:
        print("❌ 使用方式: python replace-media-links.py <public目录路径> <R2公网域名>")
        print("   示例: python replace-media-links.py ./public https://cdn.yuzexiaoyu.space")
        sys.exit(1)
    
    # 解析参数
    public_dir = Path(sys.argv[1])
    new_domain = sys.argv[2].rstrip('/')
    
    # 校验目录是否存在
    if not public_dir.exists() or not public_dir.is_dir():
        print(f"❌ 目录不存在: {public_dir.absolute()}")
        sys.exit(1)
    
    # 批量处理所有HTML文件
    print(f"🔍 开始替换链接 → 目标CDN: {new_domain}")
    print(f"📂 处理目录: {public_dir.absolute()}")
    modified_count = 0
    
    for html_file in public_dir.rglob('*.html'):
        if replace_links(html_file, new_domain, public_dir):
            modified_count += 1
    
    # 输出结果
    print(f"\n✨ 处理完成！共修改 {modified_count} 个文件")
