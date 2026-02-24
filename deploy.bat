@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

echo ========================================
echo   Hugo 网站推送脚本
echo   仓库: F:\Yuzexiaoyu.space
echo ========================================
echo.

:: 检查 .gitignore 并添加必要规则
if not exist .gitignore (
    echo public/ > .gitignore
    echo resources/ >> .gitignore
    echo hugo.exe >> .gitignore
    echo .vscode/ >> .gitignore
    echo Thumbs.db >> .gitignore
    echo .gitignore 已创建
) else (
    findstr /C:"public/" .gitignore >nul || echo public/ >> .gitignore
    findstr /C:"hugo.exe" .gitignore >nul || echo hugo.exe >> .gitignore
    echo .gitignore 已检查
)

:: 从 Git 移除 hugo.exe（保留本地文件）
if exist hugo.exe (
    git rm --cached hugo.exe -f >nul 2>&1
    echo 已从 Git 移除 hugo.exe（本地文件保留）
)

:: 删除嵌套 .git（如 public/.git）
if exist public\.git (
    rmdir /s /q public\.git 2>nul
    git rm --cached -r public -f >nul 2>&1
    echo 已清理嵌套 Git 仓库（public\.git）
)

:: 添加所有文件
echo.
echo 正在添加文件到暂存区...
git add .

:: 检查是否有更改
git diff-index --quiet HEAD -- && (
    echo.
    echo ⚠️  没有检测到更改，无需提交
    pause
    exit /b 0
)

:: 提交
echo.
set /p COMMIT_MSG="📝 请输入提交消息（直接回车使用默认）: "
if "%COMMIT_MSG%"=="" set COMMIT_MSG=Update site content

git commit -m "%COMMIT_MSG%"
if errorlevel 1 (
    echo.
    echo ❌ 提交失败
    pause
    exit /b 1
)

:: 推送
echo.
echo 📤 正在推送到 GitHub...
git push
if errorlevel 1 (
    echo.
    echo ❌ 推送失败，请检查网络或权限
    pause
    exit /b 1
)

echo.
echo ========================================
echo ✅ 推送成功！
echo ========================================
echo.
echo 🔗 GitHub Actions 将自动：
echo    1. 构建 Hugo 站点
echo    2. 上传图片到 Cloudflare R2
echo    3. 替换 HTML 中的图片链接
echo    4. 部署到 GitHub Pages
echo.
echo 🌐 几分钟后访问: https://yuzexiaoyu.github.io
echo.
pause