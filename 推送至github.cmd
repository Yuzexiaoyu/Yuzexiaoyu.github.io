@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

REM 确保 origin 指向正确仓库（存在则纠正 URL，不存在则添加）
git remote set-url origin https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io.git 2>nul || git remote add origin https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io.git

git add -A

set /p MSG="推送备注: "
if "%MSG%"=="" set MSG=Update site content

git commit -m "%MSG%"
if errorlevel 1 echo [提示] 没有新改动可提交，将直接推送当前 HEAD。

git push origin master --force

if errorlevel 1 (
    echo.
    echo [X] 推送失败，请查看上方 Git 报错。
) else (
    echo.
    echo [OK] 推送成功，GitHub Actions 将自动构建并部署到 R2 + Pages。
)

pause
