@echo off
:: 强制ANSI编码，避免乱码
chcp 936 > nul

echo ======================== 部署 Hugo 博客（无拉取版） ========================

:: 核心配置（已确认是你的目录，无需修改）
set HUGO_DIR=F:\Yuzexiaoyu.space
set GIT_REMOTE=origin
set GIT_BRANCH=master

:: 1. 校验本地目录是否存在
if not exist "%HUGO_DIR%" (
    echo ? 错误：本地博客目录不存在 → %HUGO_DIR%
    pause
    exit /b 1
)

:: 2. 进入博客目录，构建Hugo静态文件
cd /d "%HUGO_DIR%"
echo 【1/5】构建Hugo静态文件（包含草稿）
hugo -D --minify
if %errorlevel% neq 0 (
    echo ? Hugo构建失败！请检查：
    echo  ① 是否安装Hugo（CMD输入hugo version验证）
    echo  ② 配置文件是否有语法错误
    pause
    exit /b 1
)

:: 3. 校验public目录是否生成
if not exist "public" (
    echo ? 错误：Hugo未生成public目录！
    pause
    exit /b 1
)

:: 4. 进入public目录，初始化Git（首次运行自动初始化）
cd public
echo 【2/5】检查并初始化Git仓库
if not exist ".git" (
    git init
    git remote add origin https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io.git
    echo ? 已初始化Git仓库并关联远程
)

:: 5. 暂存所有文件
echo 【3/5】暂存所有静态文件
git add .

:: 6. 自动生成提交备注（避免空备注）
set COMMIT_MSG=博客部署_%date:~0,10%_%time:~0,8%
set COMMIT_MSG=%COMMIT_MSG::=-%
echo 【4/5】提交修改 → %COMMIT_MSG%
git commit -m "%COMMIT_MSG%"
if %errorlevel% neq 0 (
    echo ??  无新内容可提交（本地文件未修改）
)

:: 7. 强制推送（核心：跳过拉取，直接覆盖远程）
echo 【5/5】强制推送至GitHub（覆盖远程所有内容）
git push -f %GIT_REMOTE% %GIT_BRANCH%
if %errorlevel% equ 0 (
    echo ======================== 部署结果 ========================
    echo ? 部署成功！
    echo ?? 访问地址：https://yuzexiaoyu.github.io
    echo ==========================================================
) else (
    echo ======================== 部署结果 ========================
    echo ? 推送失败！非网络问题的常见原因：
    echo  ① Git未配置用户名/邮箱：执行以下命令配置：
    echo     git config --global user.name "你的GitHub用户名"
    echo     git config --global user.email "你的GitHub邮箱"
    echo  ② 远程仓库地址错误：检查是否是 https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io.git
    echo  ③ 无仓库权限：确认是你自己的仓库，且登录了正确的GitHub账号
    echo ==========================================================
)

pause
