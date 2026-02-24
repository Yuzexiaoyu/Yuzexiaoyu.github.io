@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

echo ========================================
echo   部署到 yuzexiaoyu.space
echo ========================================
echo.

:: 清理大文件
if exist hugo.exe git rm --cached hugo.exe -f >nul 2>&1

:: 确保 CNAME
echo yuzexiaoyu.space > static\CNAME 2>nul

:: 更新 .gitignore
findstr /C:"public/" .gitignore >nul || echo public/ >> .gitignore
findstr /C:"hugo.exe" .gitignore >nul || echo hugo.exe >> .gitignore

:: 提交推送
git add .
git commit -m "deploy: 部署到 yuzexiaoyu.space" --allow-empty >nul 2>&1
git push

echo.
echo ========================================
echo ✅ 已推送！等待 GitHub Actions 部署...
echo ========================================
echo.
echo 🔑 请确认:
echo   • Secrets 已配置（5 个 R2 密钥）
echo   • R2 桶已开启 Public access
echo   • DNS 已配置 CNAME 到 yuzexiaoyu.github.io
echo.
echo 🌐 2 分钟后访问: https://yuzexiaoyu.space
echo.
pause