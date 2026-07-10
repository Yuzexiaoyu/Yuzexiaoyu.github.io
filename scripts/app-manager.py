#!/usr/bin/env python3
"""
临时页面管理面板
运行: python scripts/app-manager.py
自动打开浏览器访问 http://localhost:5000
"""

import os
import json
import shutil
import webbrowser
from http.server import HTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse, parse_qs
from datetime import date

# === 配置 ===
PORT = 5000
STATIC_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "static")
MANIFEST_PATH = os.path.join(STATIC_DIR, ".app-manifest.json")
RESERVED_PATHS = {"post", "page", "novel", "categories", "tags", "cursor", "lib", "music", "CNAME", "css", "js", "images", "fonts", "scss", "ts"}

# === Manifest 操作 ===
def read_manifest():
    if os.path.exists(MANIFEST_PATH):
        with open(MANIFEST_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    return {"pages": []}

def write_manifest(data):
    with open(MANIFEST_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

# === 页面模板 ===
PAGE_TEMPLATE = """<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{name}</title>
    <style>
        * {{ margin: 0; padding: 0; box-sizing: border-box; }}
        body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #0a0a0a; color: #e0e0e0; min-height: 100vh; display: flex; align-items: center; justify-content: center; }}
        .container {{ text-align: center; padding: 2rem; }}
        h1 {{ font-size: 2.5rem; margin-bottom: 1rem; }}
        p {{ color: #888; }}
    </style>
</head>
<body>
    <div class="container">
        <h1>{name}</h1>
        <p>页面已就绪，请编辑 static/{path}/index.html</p>
    </div>
</body>
</html>
"""

# === 管理面板 HTML ===
ADMIN_HTML = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>临时页面管理</title>
<style>
* { margin: 0; padding: 0; box-sizing: border-box; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", sans-serif; background: #111; color: #e0e0e0; min-height: 100vh; padding: 2rem; }
h1 { font-size: 1.8rem; margin-bottom: 1.5rem; color: #fff; }
.toolbar { display: flex; gap: 0.5rem; margin-bottom: 1.5rem; }
.toolbar input { flex: 1; padding: 0.6rem 1rem; border: 1px solid #333; border-radius: 6px; background: #1a1a1a; color: #e0e0e0; font-size: 0.9rem; }
.toolbar input:focus { outline: none; border-color: #5b8af5; }
.toolbar button { padding: 0.6rem 1.2rem; border: none; border-radius: 6px; background: #5b8af5; color: #fff; cursor: pointer; font-size: 0.9rem; white-space: nowrap; }
.toolbar button:hover { background: #4a7ae5; }
table { width: 100%; border-collapse: collapse; }
th, td { text-align: left; padding: 0.75rem 1rem; border-bottom: 1px solid #222; }
th { color: #888; font-weight: 500; font-size: 0.85rem; text-transform: uppercase; }
td { font-size: 0.9rem; }
.url { color: #5b8af5; text-decoration: none; }
.url:hover { text-decoration: underline; }
.actions button { padding: 0.3rem 0.7rem; margin-right: 0.3rem; border: 1px solid #333; border-radius: 4px; background: transparent; color: #ccc; cursor: pointer; font-size: 0.8rem; }
.actions button:hover { background: #222; }
.actions button.danger { border-color: #e55; color: #e55; }
.actions button.danger:hover { background: #2a1515; }
.empty { text-align: center; color: #555; padding: 3rem; }
.toast { position: fixed; bottom: 2rem; right: 2rem; padding: 0.8rem 1.5rem; background: #2a2a2a; border: 1px solid #333; border-radius: 8px; font-size: 0.9rem; opacity: 0; transition: opacity 0.3s; }
.toast.show { opacity: 1; }
.toast.error { border-color: #e55; color: #e55; }
</style>
</head>
<body>
<h1>📂 临时页面管理</h1>
<div class="toolbar">
    <input type="text" id="name-input" placeholder="页面名称（如：图库）">
    <input type="text" id="path-input" placeholder="路径（如：gallery）">
    <button onclick="addPage()">新增页面</button>
</div>
<table>
    <thead><tr><th>名称</th><th>线上路径</th><th>创建日期</th><th>操作</th></tr></thead>
    <tbody id="page-list"></tbody>
</table>
<div class="toast" id="toast"></div>

<script>
const DOMAIN = 'yuzexiaoyu.space';
let pages = [];

async function load() {
    const res = await fetch('/api/pages');
    pages = await res.json();
    render();
}

function render() {
    const tbody = document.getElementById('page-list');
    if (pages.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" class="empty">暂无临时页面，点击上方新增</td></tr>';
        return;
    }
    tbody.innerHTML = pages.map(p => `
        <tr>
            <td>${p.name}</td>
            <td><a class="url" href="http://localhost:${location.port}/${p.path}/" target="_blank">${DOMAIN}/${p.path}/</a></td>
            <td>${p.created}</td>
            <td class="actions">
                <button onclick="renamePage('${p.path}')">改路径</button>
                <button class="danger" onclick="deletePage('${p.path}')">删除</button>
            </td>
        </tr>
    `).join('');
}

async function addPage() {
    const name = document.getElementById('name-input').value.trim();
    const path = document.getElementById('path-input').value.trim();
    if (!name || !path) { toast('请填写名称和路径', true); return; }
    const res = await fetch('/api/pages', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({name, path}) });
    const data = await res.json();
    if (!res.ok) { toast(data.error, true); return; }
    document.getElementById('name-input').value = '';
    document.getElementById('path-input').value = '';
    toast(`已创建: ${DOMAIN}/${path}/`);
    load();
}

async function deletePage(path) {
    if (!confirm(`确认删除 /${path}/ ？文件夹将被永久删除。`)) return;
    const res = await fetch(`/api/pages/${path}`, { method: 'DELETE' });
    if (!res.ok) { const d = await res.json(); toast(d.error, true); return; }
    toast('已删除');
    load();
}

async function renamePage(oldPath) {
    const newPath = prompt('输入新路径:', oldPath);
    if (!newPath || newPath === oldPath) return;
    const res = await fetch(`/api/pages/${oldPath}/rename`, { method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({newPath}) });
    const data = await res.json();
    if (!res.ok) { toast(data.error, true); return; }
    toast(`路径已更改: ${DOMAIN}/${newPath}/`);
    load();
}

function toast(msg, isError) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.className = 'toast show' + (isError ? ' error' : '');
    setTimeout(() => el.className = 'toast', 2500);
}

load();
</script>
</body>
</html>
"""

# === HTTP 服务 ===
class Handler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        pass  # 静默日志

    def _json_response(self, code, data):
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.end_headers()
        self.wfile.write(json.dumps(data, ensure_ascii=False).encode())

    def _html_response(self, html):
        self.send_response(200)
        self.send_header("Content-Type", "text/html; charset=utf-8")
        self.end_headers()
        self.wfile.write(html.encode())

    def _validate_path(self, path):
        """校验路径合法性，返回错误信息或 None"""
        if not path:
            return "路径不能为空"
        if path in RESERVED_PATHS:
            return f"路径 '{path}' 是保留路径，不可使用"
        if not all(c.isalnum() or c in "-_" for c in path):
            return "路径只能包含字母、数字、短横线、下划线"
        if path.startswith(("-", "_")):
            return "路径不能以 - 或 _ 开头"
        return None

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path == "/" or parsed.path == "":
            self._html_response(ADMIN_HTML)
        elif parsed.path == "/api/pages":
            manifest = read_manifest()
            self._json_response(200, manifest["pages"])
        else:
            # 尝试提供 static 目录下的文件（预览用）
            file_path = os.path.join(STATIC_DIR, parsed.path.lstrip("/"))
            if os.path.isdir(file_path):
                file_path = os.path.join(file_path, "index.html")
            if os.path.isfile(file_path):
                self.send_response(200)
                if file_path.endswith(".html"):
                    ct = "text/html; charset=utf-8"
                elif file_path.endswith(".css"):
                    ct = "text/css"
                elif file_path.endswith(".js"):
                    ct = "application/javascript"
                elif file_path.endswith(".json"):
                    ct = "application/json"
                else:
                    ct = "application/octet-stream"
                self.send_header("Content-Type", ct)
                self.end_headers()
                with open(file_path, "rb") as f:
                    self.wfile.write(f.read())
            else:
                self._json_response(404, {"error": "未找到"})

    def do_POST(self):
        if self.path == "/api/pages":
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            name = body.get("name", "").strip()
            path = body.get("path", "").strip().lower()

            err = self._validate_path(path)
            if err:
                self._json_response(400, {"error": err})
                return

            target_dir = os.path.join(STATIC_DIR, path)
            if os.path.exists(target_dir):
                self._json_response(409, {"error": f"路径 '{path}' 已存在"})
                return

            # 创建目录和模板文件
            os.makedirs(target_dir)
            html = PAGE_TEMPLATE.format(name=name, path=path)
            with open(os.path.join(target_dir, "index.html"), "w", encoding="utf-8") as f:
                f.write(html)

            # 更新 manifest
            manifest = read_manifest()
            manifest["pages"].append({"name": name, "path": path, "created": str(date.today())})
            write_manifest(manifest)
            self._json_response(201, {"ok": True})
        else:
            self._json_response(404, {"error": "未找到"})

    def do_DELETE(self):
        # /api/pages/{path}
        parts = self.path.split("/")
        if len(parts) >= 4 and parts[1] == "api" and parts[2] == "pages":
            path = parts[3]
            manifest = read_manifest()
            page = next((p for p in manifest["pages"] if p["path"] == path), None)
            if not page:
                self._json_response(404, {"error": "页面不在管理列表中"})
                return

            target_dir = os.path.join(STATIC_DIR, path)
            if os.path.exists(target_dir):
                shutil.rmtree(target_dir)

            manifest["pages"] = [p for p in manifest["pages"] if p["path"] != path]
            write_manifest(manifest)
            self._json_response(200, {"ok": True})
        else:
            self._json_response(404, {"error": "未找到"})

    def do_PUT(self):
        # /api/pages/{path}/rename
        parts = self.path.split("/")
        if len(parts) >= 5 and parts[1] == "api" and parts[2] == "pages" and parts[4] == "rename":
            old_path = parts[3]
            length = int(self.headers.get("Content-Length", 0))
            body = json.loads(self.rfile.read(length))
            new_path = body.get("newPath", "").strip().lower()

            err = self._validate_path(new_path)
            if err:
                self._json_response(400, {"error": err})
                return

            manifest = read_manifest()
            page = next((p for p in manifest["pages"] if p["path"] == old_path), None)
            if not page:
                self._json_response(404, {"error": "页面不在管理列表中"})
                return

            old_dir = os.path.join(STATIC_DIR, old_path)
            new_dir = os.path.join(STATIC_DIR, new_path)
            if os.path.exists(new_dir):
                self._json_response(409, {"error": f"路径 '{new_path}' 已被占用"})
                return

            os.rename(old_dir, new_dir)
            page["path"] = new_path
            write_manifest(manifest)
            self._json_response(200, {"ok": True})
        else:
            self._json_response(404, {"error": "未找到"})


# === 启动 ===
if __name__ == "__main__":
    print(f"管理面板已启动: http://localhost:{PORT}")
    print("按 Ctrl+C 退出")
    webbrowser.open(f"http://localhost:{PORT}")
    server = HTTPServer(("127.0.0.1", PORT), Handler)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已关闭")
        server.shutdown()
