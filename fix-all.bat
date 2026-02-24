@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

echo ========================================
echo   Hugo 部署一键修复（Hugo 0.156.0）
echo ========================================
echo.

:: 1. 清理子模块痕迹
echo [1/5] 清理子模块痕迹...
git rm --cached themes\stack -r -f >nul 2>&1
if exist "themes\stack\.git" (
    rmdir /s /q "themes\stack\.git" 2>nul
    echo   ✓ 已删除 themes\stack\.git
)
if exist ".gitmodules" del ".gitmodules" >nul & echo   ✓ 已删除 .gitmodules

:: 2. 修复 deploy.yml（使用 0.156.0）
echo [2/5] 生成 deploy.yml...
mkdir ".github\workflows" 2>nul

(
echo name: Deploy Site and Upload Assets to R2
echo.
echo on:
echo   push:
echo     branches: [ master ]
echo.
echo permissions:
echo   contents: read
echo   pages: write
echo   id-token: write
echo.
echo jobs:
echo   deploy:
echo     runs-on: ubuntu-latest
echo     steps:
echo       - name: Checkout code
echo         uses: actions/checkout@v4
echo         with:
echo           submodules: false
echo           fetch-depth: 0
echo.
echo       - name: Set up Python
echo         uses: actions/setup-python@v5
echo         with:
echo           python-version: '3.11'
echo.
echo       - name: Install dependencies
echo         run: ^|
echo           python -m pip install --upgrade pip
echo           pip install beautifulsoup4
echo.
echo       - name: Setup Hugo
echo         uses: peaceiris/actions-hugo@v2
echo         with:
echo           hugo-version: '0.156.0'
echo           extended: true
echo.
echo       - name: Build site
echo         run: hugo --minify --gc
echo.
echo       - name: Configure AWS Credentials for R2
echo         uses: aws-actions/configure-aws-credentials@v4
echo         with:
echo           aws-access-key-id: ${{ secrets.R2_ACCESS_KEY_ID }}
echo           aws-secret-access-key: ${{ secrets.R2_SECRET_ACCESS_KEY }}
echo           aws-region: auto
echo.
echo       - name: Upload Images to R2
echo         env:
echo           BUCKET: ${{ secrets.R2_BUCKET_NAME }}
echo           ENDPOINT: ${{ secrets.R2_ENDPOINT }}
echo         run: ^|
echo           aws s3 sync public/ s3://$BUCKET/ ^
echo             --endpoint-url $ENDPOINT ^
echo             --acl public-read ^
echo             --exclude "*" ^
echo             --include "*.jpg" --include "*.jpeg" --include "*.png" ^
echo             --include "*.gif" --include "*.webp" --include "*.svg" ^
echo             --include "*.bmp" --include "*.ico" ^
echo             --delete
echo.
echo       - name: Replace Image Links with R2 URLs
echo         env:
echo           R2_PUBLIC_URL: ${{ secrets.R2_PUBLIC_URL }}
echo         run: ^|
echo           python scripts/replace-img-links.py public "$R2_PUBLIC_URL"
echo.
echo       - name: Setup Pages
echo         uses: actions/configure-pages@v5
echo.
echo       - name: Upload artifact
echo         uses: actions/upload-pages-artifact@v3
echo         with:
echo           path: ./public
echo.
echo       - name: Deploy to GitHub Pages
echo         uses: actions/deploy-pages@v4
) > ".github\workflows\deploy.yml"

echo   ✓ deploy.yml 已生成（Hugo 0.156.0）

:: 3. 更新 .gitignore
echo [3/5] 更新 .gitignore...
type .gitignore | findstr /C:"public/" >nul || echo public/ >> .gitignore
type .gitignore | findstr /C:"hugo.exe" >nul || echo hugo.exe >> .gitignore
type .gitignore | findstr /C:"resources/" >nul || echo resources/ >> .gitignore

:: 4. 重新添加主题文件
echo [4/5] 重新添加主题文件...
git add themes\stack >nul 2>&1

:: 5. 提交推送
echo [5/5] 提交并推送...
git add .
git commit -m "fix: 升级 Hugo 到 0.156.0，清理子模块，修复部署" --allow-empty >nul 2>&1
git push

echo.
echo ========================================
echo ✅ 修复完成！部署已触发
echo ========================================
echo.
echo ⚠️  必须操作（否则网站无法访问）：
echo   1. 打开: https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io/settings/pages
echo   2. Build and deployment → Source 选择 "GitHub Actions"
echo   3. 点击 Save 按钮
echo.
echo 🌐 2-5 分钟后访问:
echo   https://yuzexiaoyu.github.io
echo.
echo 🔍 实时查看部署进度:
echo   https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io/actions
echo.
pause