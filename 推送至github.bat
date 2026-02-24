@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

git add .

set /p MSG="提交消息: "
if "%MSG%"=="" set MSG=Update site content

git commit -m "%MSG%" >nul 2>&1
git push

if errorlevel 1 (
    echo.
    echo 推送失败
) else (
    echo.
    echo 推送成功！
)

pause