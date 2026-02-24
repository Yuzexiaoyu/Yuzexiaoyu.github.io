@echo off
:: 设置UTF-8编码，避免中文乱码
chcp 65001 > nul

:: ====================== 配置（无需修改，已适配你的目录）======================
set "BLOG_DIR=F:\Yuzexiaoyu.space"
set "GIT_REMOTE=origin"
set "GIT_BRANCH=master"
:: ============================================================================

echo ======================== 开始推送博客到GitHub ========================
echo 博客目录：%BLOG_DIR%
echo 远程仓库：%GIT_REMOTE%
echo 推送分支：%GIT_BRANCH%
echo =====================================================================

:: 1. 切换到博客目录
echo 【1/6】切换到博客目录...
cd /d "%BLOG_DIR%"
if %errorlevel% neq 0 (
    echo ❌ 错误：无法进入目录 %BLOG_DIR%，请检查路径是否正确！
    pause
    exit /b 1
)

:: 2. 检查是否是Git仓库
echo 【2/6】检查Git仓库状态...
if not exist ".git" (
    echo ❌ 错误：当前目录不是Git仓库！请先执行以下命令初始化：
    echo 1. 打开CMD，输入：cd /d "%BLOG_DIR%"
    echo 2. 输入：git init
    echo 3. 输入：git remote add origin https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io.git
    pause
    exit /b 1
)

:: 3. 检查Git用户配置（已手动配置，跳过检查）
echo 【3/6】跳过Git用户配置检查...
:: 以下代码注释掉，直接跳过
:: set "GIT_NAME="
:: for /f "delims=" %%i in ('git config --global user.name 2^>nul') do set "GIT_NAME=%%i"
:: set "GIT_EMAIL="
:: for /f "delims=" %%i in ('git config --global user.email 2^>nul') do set "GIT_EMAIL=%%i"
:: if not defined GIT_NAME or not defined GIT_EMAIL (
::     echo ❌ 错误：未配置Git用户名/邮箱！请先配置：
::     echo 1. 打开CMD，输入：git config --global user.name "Yuzexiaoyu"
::     echo 2. 输入：git config --global user.email "你的GitHub绑定邮箱"
::     pause
::     exit /b 1
:: )
:: echo ✅ Git用户已配置：%GIT_NAME% ^< %GIT_EMAIL% ^>


:: 4. 拉取远程最新代码（避免冲突）
echo 【4/6】拉取远程最新代码...
git pull %GIT_REMOTE% %GIT_BRANCH%
if %errorlevel% neq 0 (
    echo ⚠️  警告：拉取远程代码失败（可能是首次推送），继续推送...
)

:: 5. 暂存所有修改
echo 【5/6】暂存所有修改...
git add .
if %errorlevel% neq 0 (
    echo ❌ 错误：Git添加文件失败！
    pause
    exit /b 1
)

:: 6. 提交并推送
echo 【6/6】提交并推送代码...
set /p "COMMIT_MSG=请输入提交备注（回车使用默认备注）："
if not defined COMMIT_MSG (
    set "COMMIT_MSG=更新博客：%date:~0,10% %time:~0,8%"
)
git commit -m "%COMMIT_MSG%"
if %errorlevel% neq 0 (
    echo ❌ 错误：Git提交失败！可能是本地无修改内容。
    pause
    exit /b 1
)

git push %GIT_REMOTE% %GIT_BRANCH%
if %errorlevel% equ 0 (
    echo ======================== 推送成功！ ========================
    echo ✅ 代码已成功推送到GitHub
    echo ✅ 正在触发GitHub Action自动部署，查看进度：
    echo 🔗 https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io/actions
    echo ===========================================================
) else (
    echo ======================== 推送失败！ ========================
    echo ❌ 推送失败，请检查：
    echo 1. 网络是否能访问GitHub
    echo 2. 远程仓库地址是否正确
    echo 3. 是否有GitHub推送权限（可生成Personal Access Token）
    echo ===========================================================
)

pause
exit /b 0
