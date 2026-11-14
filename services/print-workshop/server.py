"""Local-only workshop API and Hugo host. Python 3.10+, no pip dependencies."""
from __future__ import annotations

import argparse
import hashlib
import html
import hmac
import io
import json
import mimetypes
import os
import re
import secrets
import socket
import sqlite3
import struct
import subprocess
import time
import uuid
import zipfile
from contextlib import contextmanager
from http.cookies import SimpleCookie
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlsplit

ROOT = Path(__file__).resolve().parents[2]
MAX_UPLOAD = 64 * 1024 * 1024
PRICE_LIMIT = 10_000_000


class Problem(Exception):
    def __init__(self, message, status=400):
        self.message, self.status = message, status


def integer(value, name, low, high):
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise Problem(f"{name}须为 {low}～{high} 的整数")
    return value


def price(low, high, infill):
    integer(low, "最低价", 0, PRICE_LIMIT)
    integer(high, "最高价", low, PRICE_LIMIT)
    integer(infill, "填充比例", 15, 100)
    # Exact positive half-up rounding, without Python's banker's rounding.
    numerator = low * 85 + (high - low) * (infill - 15)
    return (numerator * 2 + 85) // 170


def short_text(value, label, limit=160, required=False):
    if not isinstance(value, str) or len(value.strip()) > limit:
        raise Problem(f"{label}格式不正确或超过 {limit} 字")
    value = value.strip()
    if required and not value:
        raise Problem(f"请填写{label}")
    return value


class Store:
    def __init__(self, folder):
        self.folder = Path(folder).resolve()
        self.folder.mkdir(parents=True, exist_ok=True)
        self.media = self.folder / "files"
        self.media.mkdir(exist_ok=True)
        self.database = self.folder / "workshop.sqlite3"
        with self.connect() as db:
            db.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS entries
                (id TEXT PRIMARY KEY, payload TEXT NOT NULL, revision INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS assets
                (id TEXT PRIMARY KEY, name TEXT NOT NULL, ext TEXT NOT NULL,
                 kind TEXT NOT NULL, mime TEXT NOT NULL, size INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS colors
                (id TEXT PRIMARY KEY, name TEXT NOT NULL, hex TEXT NOT NULL, active INTEGER NOT NULL);
                CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS events
                (id INTEGER PRIMARY KEY, at TEXT NOT NULL, action TEXT NOT NULL, target TEXT NOT NULL);
            """)
            db.execute("INSERT OR IGNORE INTO settings VALUES (1, ?)",
                       (json.dumps({"name": "雨泽小鱼的工坊", "qq_asset": None}),))

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.database, timeout=15)
        db.row_factory = sqlite3.Row
        try:
            yield db
            db.commit()
        except Exception:
            db.rollback()
            raise
        finally:
            db.close()

    @staticmethod
    def event(db, action, target):
        db.execute("INSERT INTO events(at,action,target) VALUES (?,?,?)",
                   (time.strftime("%Y-%m-%dT%H:%M:%S%z"), action, target))

    def asset(self, db, asset_id, kind=None):
        if not isinstance(asset_id, str) or not re.fullmatch(r"[0-9a-f]{64}", asset_id):
            raise Problem("素材引用格式不正确")
        row = db.execute("SELECT * FROM assets WHERE id=?", (asset_id,)).fetchone()
        if not row or (kind and row["kind"] != kind):
            raise Problem("素材不存在或类型不匹配")
        return dict(row)

    def asset_view(self, db, asset_id):
        if not asset_id:
            return None
        a = self.asset(db, asset_id)
        a["url"] = f"/workshop-media/{a['id']}.{a['ext']}" if a["kind"] != "source" else None
        return a

    def entry_view(self, db, row, admin=False):
        p = json.loads(row["payload"])
        p.update(id=row["id"], revision=row["revision"])
        p["images"] = [self.asset_view(db, a) for a in p.get("image_ids", [])]
        p["videos"] = [self.asset_view(db, a) for a in p.get("video_ids", [])]
        p["model"] = self.asset_view(db, p.get("model_id"))
        p["colors"] = []
        for color_id in p.get("color_ids", []):
            c = db.execute("SELECT * FROM colors WHERE id=?", (color_id,)).fetchone()
            if c and (admin or c["active"]):
                p["colors"].append(dict(c))
        if admin:
            p["source"] = self.asset_view(db, p.get("source_id"))
        else:
            p.pop("source_id", None)
        return p

    def get_entries(self, admin=False):
        with self.connect() as db:
            result = [self.entry_view(db, row, admin) for row in db.execute("SELECT * FROM entries ORDER BY rowid DESC")]
            return result if admin else [p for p in result if p["status"] == "published"]

    def get_entry(self, entry_id, admin=False):
        with self.connect() as db:
            row = db.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone()
            if not row or (not admin and json.loads(row["payload"])["status"] != "published"):
                raise Problem("内容不存在或已下架", 404)
            return self.entry_view(db, row, admin)

    def save_entry(self, data, entry_id=None):
        if not isinstance(data, dict):
            raise Problem("内容格式不正确")
        kind, status = data.get("kind"), data.get("status", "draft")
        if kind not in ("work", "product") or status not in ("draft", "published", "archived"):
            raise Problem("请选择正确的栏目与状态")
        payload = {"kind": kind, "status": status,
                   "name": short_text(data.get("name", ""), "名称", 80, True),
                   "description": short_text(data.get("description", ""), "说明", 5000),
                   "image_ids": data.get("image_ids", []), "video_ids": data.get("video_ids", []),
                   "model_id": data.get("model_id") or None, "source_id": data.get("source_id") or None,
                   "color_ids": data.get("color_ids", []),
                   "min_price": data.get("min_price", 0), "max_price": data.get("max_price", 0),
                   "is_demo": data.get("is_demo") is True}
        for key, limit in (("image_ids", 12), ("video_ids", 6), ("color_ids", 80)):
            if not isinstance(payload[key], list) or len(payload[key]) > limit or any(not isinstance(x, str) for x in payload[key]):
                raise Problem("图片、视频或颜色列表格式不正确")
            payload[key] = list(dict.fromkeys(payload[key]))
        price(payload["min_price"], payload["max_price"], 15)
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            old = db.execute("SELECT * FROM entries WHERE id=?", (entry_id,)).fetchone() if entry_id else None
            if entry_id and not old:
                raise Problem("内容不存在", 404)
            if old and data.get("revision") != old["revision"]:
                raise Problem("内容已在其他页面更新，请重新打开后编辑", 409)
            for a in payload["image_ids"]:
                self.asset(db, a, "image")
            for a in payload["video_ids"]:
                self.asset(db, a, "video")
            for key, asset_kind in (("model_id", "model"), ("source_id", "source")):
                if payload[key]:
                    if not isinstance(payload[key], str):
                        raise Problem("模型引用格式不正确")
                    self.asset(db, payload[key], asset_kind)
            for c in payload["color_ids"]:
                if not db.execute("SELECT 1 FROM colors WHERE id=? AND active=1", (c,)).fetchone():
                    raise Problem("所选颜色已停用，请重新选择")
            if status == "published":
                if not payload["image_ids"]:
                    raise Problem("上架前请至少上传一张图片")
                if kind == "product" and (not payload["model_id"] or not payload["color_ids"]):
                    raise Problem("商品上架前请补充 GLB 预览模型和可用颜色；3MF 原件可先保存为草稿")
            entry_id = entry_id or uuid.uuid4().hex
            revision = old["revision"] + 1 if old else 1
            payload["updated_at"] = time.strftime("%Y-%m-%dT%H:%M:%S%z")
            db.execute("INSERT OR REPLACE INTO entries VALUES (?,?,?)", (entry_id, json.dumps(payload, ensure_ascii=False), revision))
            self.event(db, "save-entry", entry_id)
        return self.get_entry(entry_id, True)

    def delete_entry(self, entry_id, revision):
        with self.connect() as db:
            result = db.execute("DELETE FROM entries WHERE id=? AND revision=?", (entry_id, revision))
            if not result.rowcount:
                raise Problem("内容已改变或不存在，请刷新列表", 409)
            self.event(db, "delete-entry", entry_id)

    def colors(self):
        with self.connect() as db:
            return [dict(r) for r in db.execute("SELECT * FROM colors ORDER BY rowid")]

    def save_color(self, data, color_id=None):
        name = short_text(data.get("name", ""), "颜色名称", 30, True)
        color = data.get("hex", "")
        if not isinstance(color, str) or not re.fullmatch(r"#[0-9a-fA-F]{6}", color):
            raise Problem("请填写六位十六进制色值，例如 #83BFA8")
        active = data.get("active", True)
        if type(active) is not bool:
            raise Problem("颜色启用状态不正确")
        with self.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            if color_id and not db.execute("SELECT 1 FROM colors WHERE id=?", (color_id,)).fetchone():
                raise Problem("颜色不存在", 404)
            if color_id and not active:
                used = [json.loads(r[0])["name"] for r in db.execute("SELECT payload FROM entries")
                        if color_id in json.loads(r[0]).get("color_ids", [])]
                if used:
                    raise Problem("此颜色正被引用，请先从内容中取消选择：" + "、".join(used[:5]), 409)
            color_id = color_id or uuid.uuid4().hex
            db.execute("INSERT OR REPLACE INTO colors VALUES (?,?,?,?)", (color_id, name, color.upper(), int(active)))
            self.event(db, "save-color", color_id)
        return {"id": color_id, "name": name, "hex": color.upper(), "active": int(active)}

    def settings(self):
        with self.connect() as db:
            settings = json.loads(db.execute("SELECT payload FROM settings WHERE id=1").fetchone()[0])
            settings["qq_image"] = self.asset_view(db, settings.get("qq_asset"))
            return settings

    def save_settings(self, data):
        payload = {"name": "雨泽小鱼的工坊", "qq_asset": data.get("qq_asset") or None}
        with self.connect() as db:
            if payload["qq_asset"]:
                self.asset(db, payload["qq_asset"], "image")
            db.execute("UPDATE settings SET payload=? WHERE id=1", (json.dumps(payload),))
            self.event(db, "save-settings", "workshop")
        return self.settings()

    def save_asset(self, name, body, trusted_demo=False):
        name = short_text(name, "文件名", 180, True)
        ext = Path(name).suffix.lower().lstrip(".")
        if not body or len(body) > MAX_UPLOAD:
            raise Problem("文件为空或超过 64 MB")
        if ext in ("png", "jpg", "jpeg", "webp"):
            signatures = {"png": body.startswith(b"\x89PNG\r\n\x1a\n"),
                          "jpg": body.startswith(b"\xff\xd8\xff"), "jpeg": body.startswith(b"\xff\xd8\xff"),
                          "webp": body.startswith(b"RIFF") and body[8:12] == b"WEBP"}
            if not signatures[ext] or len(body) > 12 * 1024 * 1024:
                raise Problem("图片格式不正确或超过 12 MB，请使用 PNG、JPG 或 WebP")
            kind, mime = "image", "image/jpeg" if ext in ("jpg", "jpeg") else "image/" + ext
        elif ext == "svg" and trusted_demo:
            kind, mime = "image", "image/svg+xml"
        elif ext in ("mp4", "webm", "mov"):
            signatures = {"mp4": len(body) >= 12 and body[4:8] == b"ftyp",
                          "mov": len(body) >= 12 and body[4:8] == b"ftyp",
                          "webm": body.startswith(b"\x1a\x45\xdf\xa3")}
            if not signatures[ext]:
                raise Problem("视频格式不正确，请使用 MP4、WebM 或 MOV")
            kind = "video"
            mime = {"mp4": "video/mp4", "webm": "video/webm", "mov": "video/quicktime"}[ext]
        elif ext == "glb":
            try:
                magic, version, length = struct.unpack_from("<4sII", body)
                size, chunk = struct.unpack_from("<I4s", body, 12)
                metadata = json.loads(body[20:20 + size])
                if magic != b"glTF" or version != 2 or length != len(body) or chunk != b"JSON" or metadata["asset"]["version"] != "2.0":
                    raise ValueError()
                for item in metadata.get("buffers", []) + metadata.get("images", []):
                    if "uri" in item and not item["uri"].startswith("data:"):
                        raise Problem("请上传自包含 GLB，不使用外部贴图或缓冲区链接")
                if any("extensions" in p and "KHR_draco_mesh_compression" in p["extensions"] for m in metadata.get("meshes", []) for p in m.get("primitives", [])):
                    raise Problem("当前离线预览请使用未经过 Draco 压缩的 GLB")
                if any(x in metadata.get("extensionsUsed", []) for x in ("EXT_meshopt_compression", "KHR_texture_basisu")):
                    raise Problem("当前离线预览请使用普通 GLB 贴图和网格")
            except (ValueError, KeyError, TypeError, struct.error):
                raise Problem("GLB 文件结构不正确，请重新导出 glTF 2.0 二进制文件")
            kind, mime = "model", "model/gltf-binary"
        elif ext == "3mf":
            try:
                with zipfile.ZipFile(io.BytesIO(body)) as archive:
                    entries = archive.infolist()
                    if not any(p.filename.lower().endswith(".model") for p in entries) or len(entries) > 10000 or sum(p.file_size for p in entries) > 512 * 1024 * 1024:
                        raise ValueError()
            except (ValueError, zipfile.BadZipFile):
                raise Problem("3MF 文件无模型内容、格式不正确或解压体积过大")
            kind, mime = "source", "application/vnd.ms-package.3dmanufacturing-3dmodel+xml"
        else:
            raise Problem("支持 PNG／JPG／WebP 图片、MP4／WebM／MOV 视频、GLB 预览模型和 3MF 原件")
        asset_id = hashlib.sha256(body).hexdigest()
        path = self.media / f"{asset_id}.{ext}"
        if not path.exists():
            temp = self.media / f"{uuid.uuid4().hex}.tmp"
            temp.write_bytes(body)
            os.replace(temp, path)
        with self.connect() as db:
            db.execute("INSERT OR IGNORE INTO assets VALUES (?,?,?,?,?,?)", (asset_id, name, ext, kind, mime, len(body)))
            self.event(db, "upload", asset_id)
            return self.asset_view(db, asset_id)


class Server(ThreadingHTTPServer):
    daemon_threads = True
    allow_reuse_address = False

    def server_bind(self):
        if os.name == "nt":
            self.socket.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        super().server_bind()

    def __init__(self, address, store, site):
        super().__init__(address, Handler)
        self.store, self.site = store, Path(site).resolve()
        self.session = secrets.token_urlsafe(32)
        self.csrf = secrets.token_urlsafe(32)


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(args[2].site), **kwargs)

    def setup(self):
        super().setup()
        self.connection.settimeout(30)

    def end_headers(self):
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "same-origin")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        super().end_headers()

    def check_host(self):
        if self.headers.get("Host") not in (f"127.0.0.1:{self.server.server_port}", f"localhost:{self.server.server_port}"):
            raise Problem("仅允许从本机地址访问工坊", 403)

    def check_admin(self, write=False):
        cookie = SimpleCookie()
        try:
            cookie.load(self.headers.get("Cookie", ""))
            supplied = cookie["workshop_session"].value
        except (KeyError, ValueError):
            supplied = ""
        if not hmac.compare_digest(supplied, self.server.session):
            raise Problem("管理会话已过期，请刷新后台", 401)
        if write:
            origin = self.headers.get("Origin")
            if origin != "http://" + self.headers.get("Host", "") or not hmac.compare_digest(self.headers.get("X-Workshop-Token", ""), self.server.csrf):
                raise Problem("管理请求来源不正确，请刷新后台重试", 403)

    def json_response(self, data, status=200, cookie=None):
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        if cookie:
            self.send_header("Set-Cookie", cookie)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def read_body(self, limit):
        try:
            length = int(self.headers.get("Content-Length", "-1"))
        except ValueError:
            raise Problem("请求长度不正确")
        if not 0 <= length <= limit:
            raise Problem("请求超过大小限制", 413)
        body = self.rfile.read(length)
        if len(body) != length:
            raise Problem("上传未完成，请重试")
        return body

    def body_json(self):
        try:
            data = json.loads(self.read_body(128 * 1024))
        except (ValueError, UnicodeDecodeError):
            raise Problem("请求不是有效 JSON")
        if not isinstance(data, dict):
            raise Problem("请求内容须为对象")
        return data

    def guarded(self, callback):
        try:
            self.check_host()
            callback()
        except Problem as error:
            self.json_response({"error": error.message}, error.status)
        except (BrokenPipeError, ConnectionResetError, TimeoutError):
            pass
        except Exception:
            import traceback
            traceback.print_exc()
            self.json_response({"error": "本地服务处理失败，请查看服务窗口后重试"}, 500)

    def do_GET(self):
        self.guarded(self.get)

    def do_HEAD(self):
        self.guarded(self.get)

    def get(self):
        parsed = urlsplit(self.path)
        path, store = parsed.path.rstrip("/"), self.server.store
        if path == "/api/admin/session":
            if self.headers.get("Sec-Fetch-Site") == "cross-site":
                raise Problem("请直接打开本机管理页面", 403)
            return self.json_response({"token": self.server.csrf}, cookie=f"workshop_session={self.server.session}; Path=/api/admin; HttpOnly; SameSite=Strict")
        if path.startswith("/api/admin/"):
            self.check_admin()
        if path == "/api/health":
            return self.json_response({"ok": True, "local": True})
        if path in ("/api/catalog", "/api/admin/entries"):
            return self.json_response({"entries": store.get_entries(path.startswith("/api/admin/")), "settings": store.settings()})
        if path.startswith("/api/entry/") or path.startswith("/api/admin/entries/"):
            return self.json_response(store.get_entry(path.rsplit("/", 1)[1], path.startswith("/api/admin/")))
        if path == "/api/admin/colors":
            return self.json_response(store.colors())
        if path == "/api/settings" or path == "/api/admin/settings":
            return self.json_response(store.settings())
        if path == "/api/quote":
            query = parse_qs(parsed.query)
            p = store.get_entry(query.get("id", [""])[0])
            try:
                raw = query.get("infill", [""])[0]
                if not re.fullmatch(r"[0-9]+", raw):
                    raise ValueError()
                infill = int(raw)
            except ValueError:
                raise Problem("请填写有效填充整数")
            color_id = query.get("color", [""])[0]
            color = next((c for c in p["colors"] if c["id"] == color_id), None)
            if p["kind"] != "product" or not color:
                raise Problem("商品或颜色已不可选，请刷新详情")
            return self.json_response({"entry": p, "color": color, "infill": infill,
                                       "price": price(p["min_price"], p["max_price"], infill), "quantity": 1})
        if path.startswith("/api/"):
            raise Problem("接口不存在", 404)
        if path == "/admin/prints":
            # Admin is deliberately outside Hugo's content/static directories.
            # It is only served by this loopback-only process, never by Pages.
            catalog = (self.server.site / "prints/index.html").read_text(encoding="utf-8")
            css_links = re.findall(r'<link[^>]*rel="stylesheet"[^>]*>', catalog)
            bundle = re.search(r'var source = "([^"]+)";', catalog)
            if not css_links or not bundle:
                raise Problem("本地构建资源不完整，请重新运行启动工坊.cmd", 503)
            admin = (Path(__file__).parent / "admin.html").read_text(encoding="utf-8")
            admin = admin.replace("<!--WORKSHOP_STYLES-->", "\n".join(css_links)).replace("<!--WORKSHOP_SCRIPT-->", html.escape(bundle[1], quote=True))
            body = admin.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(body)
            return
        if path.startswith("/workshop-media/"):
            filename = path.rsplit("/", 1)[1]
            if not re.fullmatch(r"[0-9a-f]{64}\.(png|jpg|jpeg|webp|svg|mp4|webm|mov|glb)", filename):
                raise Problem("素材不存在", 404)
            with store.connect() as db:
                asset = store.asset(db, filename.split(".")[0])
                if asset["kind"] == "source" or filename != f"{asset['id']}.{asset['ext']}":
                    raise Problem("素材不存在", 404)
            content = (store.media / filename).read_bytes()
            start, end, status = 0, len(content) - 1, 200
            requested = self.headers.get("Range", "").strip()
            if requested:
                matched = re.fullmatch(r"bytes=(\d*)-(\d*)", requested)
                if not matched or (not matched.group(1) and not matched.group(2)):
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{len(content)}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                if matched.group(1):
                    start = int(matched.group(1))
                    end = int(matched.group(2)) if matched.group(2) else len(content) - 1
                else:
                    start = max(0, len(content) - int(matched.group(2)))
                end = min(end, len(content) - 1)
                if start >= len(content) or start > end:
                    self.send_response(416)
                    self.send_header("Content-Range", f"bytes */{len(content)}")
                    self.send_header("Content-Length", "0")
                    self.end_headers()
                    return
                status = 206
            self.send_response(status)
            self.send_header("Content-Type", asset["mime"])
            self.send_header("Content-Length", str(end - start + 1))
            self.send_header("Accept-Ranges", "bytes")
            if status == 206:
                self.send_header("Content-Range", f"bytes {start}-{end}/{len(content)}")
            self.send_header("Cache-Control", "public, max-age=31536000, immutable")
            self.end_headers()
            if self.command != "HEAD":
                self.wfile.write(content[start:end + 1])
            return
        if self.command == "HEAD":
            return super().do_HEAD()
        return super().do_GET()

    def do_POST(self):
        self.guarded(self.mutate)

    def do_PUT(self):
        self.guarded(self.mutate)

    def do_DELETE(self):
        self.guarded(self.mutate)

    def mutate(self):
        self.check_admin(True)
        path, store = urlsplit(self.path).path.rstrip("/"), self.server.store
        if path == "/api/admin/assets" and self.command == "POST":
            name = unquote(self.headers.get("X-Filename", ""))
            return self.json_response(store.save_asset(name, self.read_body(MAX_UPLOAD)), 201)
        data = self.body_json()
        if path == "/api/admin/entries" and self.command == "POST":
            return self.json_response(store.save_entry(data), 201)
        if path.startswith("/api/admin/entries/"):
            entry_id = path.rsplit("/", 1)[1]
            if self.command == "DELETE":
                store.delete_entry(entry_id, data.get("revision"))
                return self.json_response({"ok": True})
            if self.command == "PUT":
                return self.json_response(store.save_entry(data, entry_id))
        if path == "/api/admin/colors" and self.command == "POST":
            return self.json_response(store.save_color(data), 201)
        if path.startswith("/api/admin/colors/") and self.command == "PUT":
            return self.json_response(store.save_color(data, path.rsplit("/", 1)[1]))
        if path == "/api/admin/settings" and self.command == "PUT":
            return self.json_response(store.save_settings(data))
        raise Problem("操作不存在", 404)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=13135)
    parser.add_argument("--data-dir", type=Path, default=ROOT / ".local/print-workshop/data")
    parser.add_argument("--site-dir", type=Path, default=ROOT / ".local/print-workshop/site")
    parser.add_argument("--build", action="store_true")
    parser.add_argument("--demo", action="store_true", help="Seed clearly labelled samples only when the database is empty")
    args = parser.parse_args()
    url = f"http://127.0.0.1:{args.port}"
    store = Store(args.data_dir)
    if args.demo:
        from demo import seed
        seed(store)
    if args.build:
        executable = str(ROOT / "hugo.exe") if (ROOT / "hugo.exe").exists() else "hugo"
        subprocess.run([executable, "--environment", "workshop-local", "--destination", str(args.site_dir.resolve()), "--baseURL", url + "/", "--noBuildLock"], cwd=ROOT, check=True)
    if not (args.site_dir / "prints/index.html").exists():
        parser.error("未找到工坊构建页面，请使用 --build")
    try:
        server = Server(("127.0.0.1", args.port), store, args.site_dir)
    except OSError as error:
        parser.error(f"本地端口 {args.port} 未能启动；若工坊已打开，请使用现有窗口。详情：{error}")
    print(f"Workshop: {url}/prints/\nAdmin: {url}/admin/prints/\nData: {args.data_dir.resolve()}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
