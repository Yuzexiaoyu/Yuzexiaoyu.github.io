#!/usr/bin/env python3
import sys
import re
from pathlib import Path

def replace_links(html_file: Path, domain: str) -> bool:
    """替换链接：处理相对路径 + 绝对路径"""
    try:
        content = html_file.read_text(encoding='utf-8')
        original = content
        domain = domain.rstrip('/')
        
        # 获取 HTML 文件相对于 public/ 的路径
        # 例如: public/p/markdown-syntax/index.html
        #       → p/markdown-syntax/index.html
        try:
            rel_path = html_file.relative_to(html_file.parents[1])  # 跳两级到 public/
            page_dir = str(rel_path.parent).replace('\\', '/')  # p/markdown-syntax
        except:
            page_dir = ''
        
        # 1. 处理相对路径 ./xxx → 转换为 /page_dir/xxx
        def fix_relative(match):
            rel_url = match.group(2)  # ./video.mp4
            attr = match.group(1)     # src
            
            if rel_url.startswith('./'):
                filename = rel_url[2:]  # 去掉 "./"
                if page_dir:
                    abs_path = f"/{page_dir}/{filename}"
                else:
                    abs_path = f"/{filename}"
                return f'{attr}="{domain}{abs_path}"'
            return match.group(0)
        
        # 匹配: src="./xxx" 或 poster="./xxx"
        content = re.sub(r'(src|poster|content)="(\.[^"]+)"', fix_relative, content)
        
        # 2. 处理绝对路径 /p/... → CDN
        content = re.sub(r'(src|poster|content)="(/p/[^"]+)"', f'\\1="{domain}\\2"', content)
        
        # 3. 处理绝对路径 /image/... → CDN
        content = re.sub(r'(src|poster|content)="(/image/[^"]+)"', f'\\1="{domain}\\2"', content)
        
        # 4. 处理主域名链接（备用）
        content = re.sub(r'https://yuzexiaoyu\.space/p/', f'{domain}/p/', content)
        content = re.sub(r'https://yuzexiaoyu\.space/image/', f'{domain}/image/', content)
        
        if content != original:
            html_file.write_text(content, encoding='utf-8')
            return True
        return False
        
    except Exception as e:
        print(f"⚠️ {html_file.name}: {e}", file=sys.stderr)
        return False

def main():
    if len(sys.argv) < 3:
        print("Usage: python replace-media-links.py <public_dir> <domain>")
        sys.exit(1)
    
    public_dir = Path(sys.argv[1])
    domain = sys.argv[2].rstrip('/')
    
    print(f"🔍 Replacing links → {domain}")
    print(f"   • 相对路径 ./xxx → {domain}/page_dir/xxx")
    print(f"   • 绝对路径 /p/... → {domain}/p/...")
    print()
    
    count = 0
    for html_file in public_dir.rglob('*.html'):
        if replace_links(html_file, domain):
            count += 1
            print(f"✅ {html_file.relative_to(public_dir)}")
    
    print(f"\n✨ Done! Modified {count} files")

if __name__ == '__main__':
    main()