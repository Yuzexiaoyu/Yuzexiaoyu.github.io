@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

echo ========================================
echo   终极修复：配置 cdn.yuzexiaoyu.space
echo ========================================
echo.

:: 1. 下载修复版脚本（简化版，强制替换）
(
echo #!/usr/bin/env python3
echo # -*- coding: utf-8 -*-
echo import os
echo import sys
echo from pathlib import Path
echo from bs4 import BeautifulSoup
echo.
echo def get_all_html_files(directory):
echo     return [Path(root) / f for root, _, files in os.walk(directory) for f in files if f.endswith('.html')]
echo.
echo def replace_image_links(html_file, base_url):
echo     try:
echo         with open(html_file, 'r', encoding='utf-8') as f:
echo             soup = BeautifulSoup(f, 'html.parser')
echo         changed = False
echo         for img in soup.find_all('img'):
echo             src = img.get('src', '').strip()
echo             if src.startswith('/p/') and not src.startswith(('http://', 'https://')):
echo                 img['src'] = base_url.rstrip('/') + src
echo                 changed = True
echo                 print(f"✅ {html_file.relative_to(Path.cwd())}: {src} → {base_url}{src}")
echo         if changed:
echo             with open(html_file, 'w', encoding='utf-8') as f:
echo                 f.write(str(soup))
echo         return changed
echo     except Exception as e:
echo         print(f"❌ Error: {e}")
echo         return False
echo.
echo def main():
echo     if len(sys.argv) ^< 3:
echo         print("Usage: python replace-img-links.py ^<public_dir^> ^<base_url^>")
echo         sys.exit(1)
echo     public_dir = Path(sys.argv[1])
echo     base_url = sys.argv[2].rstrip('/')
echo     print(f"🔍 Replacing image links to: {base_url}")
echo     changed = sum(replace_image_links(f, base_url) for f in get_all_html_files(public_dir))
echo     print(f"\n✨ Done! Modified {changed} files")
echo.
echo if __name__ == '__main__':
echo     main()
) > "scripts\replace-img-links.py"

echo   ✓ 已替换为简化版脚本（强制替换，不检查文件存在性）

:: 2. 提交推送
git add scripts\replace-img-links.py
git commit -m "fix: 简化替换脚本，强制替换为 cdn.yuzexiaoyu.space" --allow-empty >nul 2>&1
git push

echo.
echo ========================================
echo ✅ 代码已推送！
echo ========================================
echo.
echo 🔑 请立即完成（否则图片仍走主域名）：
echo   1. Cloudflare → R2 → yuzexiaoyu 桶
echo      → Custom domains → Add "cdn.yuzexiaoyu.space"
echo.
echo   2. GitHub Secrets → R2_PUBLIC_URL
echo      值: https://cdn.yuzexiaoyu.space
echo.
echo   3. 确保 R2 桶开启 Public access
echo.
echo ⏱️  DNS 生效需 1-2 分钟
echo 🌐 预期效果:
echo      ^<img src="https://cdn.yuzexiaoyu.space/p/markdown%E8%AF%AD.../xxx.jpg"^>
echo.
pause