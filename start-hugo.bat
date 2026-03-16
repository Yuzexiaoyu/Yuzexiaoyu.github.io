@echo off
chcp 65001 >nul
echo ========================================
echo   Hugo Server 启动脚本
echo ========================================
echo.

cd /d "%~dp0"

hugo server 

pause