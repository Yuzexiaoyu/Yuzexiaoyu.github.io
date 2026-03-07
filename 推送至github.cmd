@echo off
chcp 65001 >nul
cd /d F:\Yuzexiaoyu.space

git add .

set /p MSG="推送备注: "
if "%MSG%"=="" set MSG=Update site content

git commit -m "%MSG%" >nul 2>&1

git remote remove origin 2>nul
git remote add origin https://github.com/Yuzexiaoyu/Yuzexiaoyu.github.io.git
git fetch origin --prune --force >nul 2>&1
git push origin master --force

if errorlevel 1 (
    echo Push failed
) else (
    echo Push successful
)

pause