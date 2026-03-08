#!/usr/bin/env python3
import sys
import re
from pathlib import Path
from bs4 import BeautifulSoup
from urllib.parse import quote

def replace_links(html_file, new_domain, public_dir):
    try:
        with open(html_file, 'r', encoding='utf-8') as f:
            soup = BeautifulSoup(f.read(), 'html.parser')
        
        changed = False
        new_domain = new_domain.rstrip('/')
        
        # 提取当前HTML文件相对于public/的路径（用于拼接相对路径）
        try:
            rel_path = html_file.relative_to(public_dir)
            page_dir = str(rel_path.parent).replace('\\', '/')
            if page_dir and not page_dir.startswith('/'):
                page_dir = '/' + page_dir
        except Exception as e:
            page_dir = ''
            print(f"⚠️ 路径提取失败 {html_file.name}: {e}")
        
        # ========== 1. 处理所有带src属性的标签（核心：适配APlayer歌曲链接） ==========
        # 覆盖：img/audio/video/source/track（包含APlayer的<audio>/<source>标签）
        for tag in soup.find_all(['img', 'audio', 'video', 'source', 'track']):
            src = tag.get('src', '').strip()
            if not src:
                continue
            
            # 优先处理 /music/ 开头的绝对路径（APlayer歌曲/封面核心路径）
            if src.startswith('/music/'):
                new_src = f"{new_domain}{src}"
                tag['src'] = new_src
                changed = True
                print(f"✅ [音乐链接] {src} → {new_src}")
            
            # 处理 ./ 开头的相对路径（文章内媒体）
            elif src.startswith('./'):
                filename = src[2:]
                if filename.startswith('static/music/'):  # 兼容static/music相对路径
                    abs_path = f"/{filename}"
                    new_src = f"{new_domain}{abs_path}"
                    tag['src'] = new_src
                    changed = True
                    print(f"✅ [静态音乐路径] {src} → {new_src}")
                else:
                    if page_dir:
                        abs_path = f"{page_dir}/{filename}"
                        new_src = f"{new_domain}{abs_path}"
                    else:
                        new_src = f"{new_domain}/{filename}"
                    tag['src'] = new_src
                    changed = True
                    print(f"✅ [相对路径] {src} → {new_src}")
            
            # 处理旧域名替换（兼容已有链接）
            elif 'yuzexiaoyu.space' in src:
                new_host = new_domain.replace('https://', '').replace('http://', '').rstrip('/')
                new_src = src.replace('yuzexiaoyu.space', new_host)
                tag['src'] = new_src
                changed = True
                print(f"✅ [域名替换] {src[:50]}... → {new_src[:50]}...")
        
        # ========== 2. 处理video的poster属性（视频封面） ==========
        for video in soup.find_all('video'):
            poster = video.get('poster', '').strip()
            if not poster:
                continue
            
            if poster.startswith('/music/'):
                new_poster = f"{new_domain}{poster}"
                video['poster'] = new_poster
                changed = True
                print(f"✅ [视频封面] {poster} → {new_poster}")
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
        
        # ========== 3. 处理APlayer封面（style中的background-image） ==========
        # 匹配所有带style且包含background-image的标签（APlayer的.aplayer-pic）
        for tag in soup.find_all(attrs={"style": True}):
            style = tag['style']
            if 'background-image' not in style or 'url(' not in style:
                continue
            
            # 提取background-image中的路径（兼容 url("xxx")/url('xxx')/url(xxx) 格式）
            img_path_list = re.findall(r'url\(["\']?(/music/[^"\')]+)["\']?\)', style)
            for img_path in img_path_list:
                if img_path.startswith('/music/'):
                    new_img_path = f"{new_domain}{img_path}"
                    # 保留原引号格式，只替换路径
                    style = style.replace(img_path, new_img_path)
                    changed = True
                    print(f"✅ [APlayer封面] {img_path} → {new_img_path}")
            
            if changed:
                tag['style'] = style
        
        # 保存修改后的文件
        if changed:
            with open(html_file, 'w', encoding='utf-8') as f:
                f.write(str(soup))
        return changed
    except Exception as e:
        print(f"❌ 处理文件失败 {html_file.name}: {e}")
        return False

if __name__ == '__main__':
    # 校验参数
    if len(sys.argv) < 3:
        print("❌ 使用方式: python replace-media-links.py <public目录路径> <R2公网域名>")
        print("   示例: python replace-media-links.py ./public https://cdn.yuzexiaoyu.space")
        sys.exit(1)
    
    # 解析参数
    public_dir = Path(sys.argv[1])
    new_domain = sys.argv[2].rstrip('/')
    
    # 校验目录有效性
    if not public_dir.exists() or not public_dir.is_dir():
        print(f"❌ 目录不存在或不是文件夹: {public_dir.absolute()}")
        sys.exit(1)
    
    # 批量处理所有HTML文件
    print(f"🔍 开始替换媒体链接 → 目标CDN: {new_domain}")
    print(f"📂 处理目录: {public_dir.absolute()}")
    modified_count = 0
    
    for html_file in public_dir.rglob('*.html'):
        if replace_links(html_file, new_domain, public_dir):
            modified_count += 1
    
    # 输出结果
    print(f"\n✨ 处理完成！共修改 {modified_count} 个文件")
