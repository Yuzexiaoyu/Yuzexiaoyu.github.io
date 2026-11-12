@echo off
chcp 65001 >nul
cd /d "%~dp0"
echo 正在构建并启动雨泽小鱼的工坊...
echo 首次启动会加入明确标注的演示内容，可在后台修改或删除。
echo 工坊：http://127.0.0.1:13135/prints/
echo 后台：http://127.0.0.1:13135/admin/prints/
echo 关闭窗口或按 Ctrl+C 停止服务，已保存的数据会保留。
python services\print-workshop\server.py --build --demo
pause
