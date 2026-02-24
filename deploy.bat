@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

echo 正在生成 R2 专用 deploy.yml...
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
echo       - name: Install AWS CLI
echo         run: ^|
echo           curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
echo           unzip awscliv2.zip
echo           sudo ./aws/install
echo.
echo       - name: Upload Images to R2
echo         env:
echo           AWS_ACCESS_KEY_ID: ${{ secrets.R2_ACCESS_KEY_ID }}
echo           AWS_SECRET_ACCESS_KEY: ${{ secrets.R2_SECRET_ACCESS_KEY }}
echo           AWS_DEFAULT_REGION: auto
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

echo.
echo ✅ deploy.yml 已生成（R2 专用版，移除 configure-aws-credentials）
echo.
git add .
git commit -m "fix: 移除 configure-aws-credentials，直接配置 AWS CLI 环境变量" --allow-empty >nul 2>&1
git push

echo.
echo ========================================
echo ✅ 代码已推送！
echo ========================================
echo.
echo ⚠️  最后一步（必须！）：
echo   Settings → Pages → Source 选 "GitHub Actions" → Save
echo.
echo 🌐 2-5 分钟后访问: https://yuzexiaoyu.github.io
echo.
pause