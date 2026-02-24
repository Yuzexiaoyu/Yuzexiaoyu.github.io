@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

echo ========================================
echo   Hugo 部署修复脚本（清理子模块问题）
echo ========================================
echo.
echo 检测主题目录...
set THEME_DIR=
if exist "themes\hugo-stack" (
    set THEME_DIR=hugo-stack
    echo ✓ 找到主题目录: themes\hugo-stack
) else if exist "themes\stack" (
    set THEME_DIR=stack
    echo ✓ 找到主题目录: themes\stack
) else (
    echo ✗ 未找到主题目录！请确认 themes/ 下有 hugo-stack 或 stack
    pause
    exit /b 1
)

echo.
echo ⚠️  此脚本将：
echo    1. 清理错误的子模块配置
echo    2. 修复 deploy.yml 分支配置（main → master）
echo    3. 提交并推送修复
echo.
set /p CONFIRM="确定继续？(y/n): "
if /i "%CONFIRM%" neq "y" exit /b

echo.
echo [1/4] 清理子模块痕迹...
git rm --cached "themes\%THEME_DIR%" -r -f >nul 2>&1
if exist "themes\%THEME_DIR%\.git" (
    rmdir /s /q "themes\%THEME_DIR%\.git" 2>nul
    echo   ✓ 已删除 themes\%THEME_DIR%\.git
)
git config --remove-section "submodule.themes/%THEME_DIR%" >nul 2>&1
if exist ".gitmodules" del ".gitmodules" >nul 2>&1 & echo   ✓ 已删除 .gitmodules

echo [2/4] 重新添加主题文件...
git add "themes\%THEME_DIR%" >nul 2>&1

echo [3/4] 修复 deploy.yml 配置...
:: 备份原文件
copy ".github\workflows\deploy.yml" ".github\workflows\deploy.yml.bak" >nul 2>&1
:: 替换分支为 master
powershell -Command "(gc '.github\workflows\deploy.yml') -replace 'branches: \[ main \]', 'branches: [ master ]' -replace 'branches: \[\"main\"\]', 'branches: [\"master\"]' | sc '.github\workflows\deploy.yml' -Encoding UTF8" >nul 2>&1
:: 确保关闭子模块
powershell -Command "$c=gc '.github\workflows\deploy.yml'; if ($c -notmatch 'submodules: false') { $c = $c -replace 'uses: actions/checkout@v4', \"uses: actions/checkout@v4`n      with:`n        submodules: false\"; $c | sc '.github\workflows\deploy.yml' -Encoding UTF8 }" >nul 2>&1
echo   ✓ 已修复 deploy.yml（分支: master, submodules: false）

echo [4/4] 提交并推送...
git add .
git commit -m "fix: 清理子模块，修复部署配置" --allow-empty >nul 2>&1
git push

echo.
echo ========================================
echo ✅ 修复成功！
echo ========================================
echo.
echo 下一步操作（必须！）：
echo 1. 打开仓库: https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io
echo 2. Settings → Pages → Build and deployment
echo 3. Source 选择 "GitHub Actions" → Save
echo.
echo 等待 2-5 分钟后访问:
echo   https://yuzexiaoyu.github.io
echo.
pause