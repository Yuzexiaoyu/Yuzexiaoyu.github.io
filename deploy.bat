@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

echo ========================================
echo   Hugo R2 部署配置（桶名: yuzexiaoyu）
echo ========================================
echo.

:: 创建 deploy.yml
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

:: 配置 .gitignore
findstr /C:"public/" .gitignore >nul || echo public/ >> .gitignore
findstr /C:"hugo.exe" .gitignore >nul || echo hugo.exe >> .gitignore

:: 提交更改
git add .
git commit -m "chore: 配置 R2 部署（桶名: yuzexiaoyu）" --allow-empty >nul 2>&1
git push

echo.
echo ========================================
echo ✅ 配置完成！
echo ========================================
echo.
echo 🔑 请确认已配置以下 Secrets（否则 R2 会失败）：
echo   • R2_ACCESS_KEY_ID
echo   • R2_SECRET_ACCESS_KEY
echo   • R2_BUCKET_NAME = yuzexiaoyu
echo   • R2_ENDPOINT
echo   • R2_PUBLIC_URL = https://yuzexiaoyu.8af8989ece65309e48121cc872681506.r2.cloudflarestorage.com
echo.
echo ⚠️  最后一步（必须！）：
echo   Settings → Pages → Source 选 "GitHub Actions" → Save
echo.
echo 🌐 部署完成后访问: https://yuzexiaoyu.github.io
echo.
echo 🔍 实时查看部署状态:
echo   https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io/actions
echo.
pause