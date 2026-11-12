"""Behavior tests use temporary databases/files; never modify the real workshop."""
import base64
import http.client
import io
import json
import struct
import tempfile
import threading
import unittest
import zipfile
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from demo import seed, vase_glb
from server import Handler, Problem, Server, Store, price

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1kAAAAASUVORK5CYII=")


def source_3mf():
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w") as archive:
        archive.writestr("3D/3dmodel.model", '<model xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02"/>')
    return buffer.getvalue()


class PriceTests(unittest.TestCase):
    def test_confirmed_example_and_endpoints(self):
        self.assertEqual(price(20, 105, 15), 20)
        self.assertEqual(price(20, 105, 50), 55)
        self.assertEqual(price(20, 105, 100), 105)

    def test_all_steps_match_independent_decimal_formula(self):
        for low, high in [(0, 1), (20, 100), (20, 105), (99, 99), (0, 10_000_000)]:
            values = []
            for fill in range(15, 101):
                expected = (Decimal(low) + Decimal(high-low) * Decimal(fill-15) / 85).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
                values.append(price(low, high, fill))
                self.assertEqual(values[-1], int(expected))
            self.assertEqual(values, sorted(values))

    def test_invalid_inputs(self):
        for values in [(0, 1, 14), (0, 1, 101), (0, 1, 15.5), (0, 1, True), (-1, 1, 15), (20, 19, 15), (0, 10_000_001, 15)]:
            with self.subTest(values=values), self.assertRaises(Problem):
                price(*values)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(self.temp.name)
        self.image = self.store.save_asset("cover.png", PNG)
        self.model = self.store.save_asset("vase.glb", vase_glb())
        self.color = self.store.save_color({"name": "测试绿", "hex": "#87b89e"})

    def tearDown(self):
        self.temp.cleanup()

    def product(self, **changes):
        return dict({"name": "测试商品", "kind": "product", "status": "published", "image_ids": [self.image["id"]], "model_id": self.model["id"], "color_ids": [self.color["id"]], "min_price": 20, "max_price": 105}, **changes)

    def test_persistence_including_file_and_qr(self):
        entry = self.store.save_entry(self.product())
        self.store.save_settings({"qq_asset": self.image["id"]})
        reopened = Store(self.temp.name)
        self.assertEqual(reopened.get_entry(entry["id"])["name"], "测试商品")
        self.assertEqual(reopened.settings()["qq_image"]["id"], self.image["id"])
        self.assertEqual((reopened.media / f'{self.image["id"]}.png').read_bytes(), PNG)

    def test_publish_rules_and_mutually_exclusive_kind(self):
        for changes in [{"image_ids": []}, {"model_id": None}, {"color_ids": []}, {"kind": "both"}]:
            with self.subTest(changes=changes), self.assertRaises(Problem):
                self.store.save_entry(self.product(**changes))
        work = self.store.save_entry(self.product(kind="work", model_id=None, color_ids=[]))
        self.assertIsNone(work["model"])
        draft = self.store.save_entry(self.product(status="draft", model_id=None))
        self.assertNotIn(draft["id"], [e["id"] for e in self.store.get_entries()])

    def test_revision_conflict_and_unpublish(self):
        entry = self.store.save_entry(self.product())
        updated = self.store.save_entry(dict(entry, status="archived"), entry["id"])
        self.assertEqual(updated["revision"], 2)
        with self.assertRaises(Problem) as error:
            self.store.save_entry(entry, entry["id"])
        self.assertEqual(error.exception.status, 409)
        with self.assertRaises(Problem):
            self.store.get_entry(entry["id"])
        self.assertEqual(self.store.get_entries(), [])

    def test_color_reference_guard_and_delete(self):
        entry = self.store.save_entry(self.product())
        with self.assertRaises(Problem):
            self.store.save_color({"name": "停用", "hex": "#87b89e", "active": False}, self.color["id"])
        with self.assertRaises(Problem):
            self.store.delete_entry(entry["id"], 0)
        self.store.delete_entry(entry["id"], entry["revision"])
        self.store.save_color({"name": "停用", "hex": "#87b89e", "active": False}, self.color["id"])
        self.assertEqual(self.store.get_entries(True), [])

    def test_source_preserved_without_public_url(self):
        source = self.store.save_asset("bambu.3mf", source_3mf())
        entry = self.store.save_entry(self.product(source_id=source["id"]))
        self.assertIsNone(entry["source"]["url"])
        self.assertNotIn("source_id", self.store.get_entry(entry["id"]))
        self.assertNotIn("source", self.store.get_entry(entry["id"]))

    def test_upload_rejections_and_invalid_reference(self):
        for name, body in [("bad.png", b"bad"), ("bad.glb", b"bad"), ("bad.3mf", b"bad"), ("script.svg", b"<svg/>"), ("empty.png", b"")]:
            with self.subTest(name=name), self.assertRaises(Problem):
                self.store.save_asset(name, body)
        with self.assertRaises(Problem):
            self.store.save_settings({"qq_asset": ["invalid"]})

    def test_external_glb_resources_are_rejected(self):
        metadata = json.dumps({"asset": {"version": "2.0"}, "buffers": [{"uri": "https://example.invalid/mesh.bin"}]}).encode()
        metadata += b" " * (-len(metadata) % 4)
        body = struct.pack("<4sIII4s", b"glTF", 2, 20+len(metadata), len(metadata), b"JSON") + metadata
        with self.assertRaises(Problem):
            self.store.save_asset("external.glb", body)

    def test_demo_is_seeded_once_even_after_deleting_all_entries(self):
        seed(self.store)
        self.assertEqual(len(self.store.get_entries(True)), 2)
        for item in self.store.get_entries(True):
            self.store.delete_entry(item["id"], item["revision"])
        seed(Store(self.temp.name))
        self.assertEqual(self.store.get_entries(True), [])


class QuietHandler(Handler):
    def log_message(self, *args):
        pass


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.site = Path(cls.temp.name) / "site"
        (cls.site / "prints").mkdir(parents=True)
        (cls.site / "prints/index.html").write_text('<link rel="stylesheet" href="/style.css"><script>var source = "/app.js";</script>', encoding="utf-8")
        cls.store = Store(Path(cls.temp.name) / "data")
        seed(cls.store)
        cls.server = Server(("127.0.0.1", 0), cls.store, cls.site)
        cls.server.RequestHandlerClass = QuietHandler
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.port = cls.server.server_port
        cls.host = f"127.0.0.1:{cls.port}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.temp.cleanup()

    def request(self, path, method="GET", body=None, headers=None, admin=False):
        base = {"Host": self.host}
        if admin:
            base.update({"Cookie": f"workshop_session={self.server.session}", "Origin": "http://"+self.host, "X-Workshop-Token": self.server.csrf})
        base.update(headers or {})
        if isinstance(body, dict):
            body = json.dumps(body).encode()
            base["Content-Type"] = "application/json"
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        conn.request(method, path, body=body, headers=base)
        response = conn.getresponse()
        status, content, response_headers = response.status, response.read(), dict(response.getheaders())
        conn.close()
        if "application/json" in response_headers.get("Content-Type", ""):
            content = json.loads(content)
        return status, content, response_headers

    def test_loopback_and_exclusive_binding(self):
        self.assertEqual(self.server.server_address[0], "127.0.0.1")
        with self.assertRaises(OSError):
            Server(("127.0.0.1", self.port), self.store, self.site)
        self.assertEqual(self.request("/api/health", headers={"Host": "example.invalid"})[0], 403)

    def test_session_and_csrf_guards(self):
        self.assertEqual(self.request("/api/admin/entries")[0], 401)
        self.assertEqual(self.request("/api/admin/session", headers={"Sec-Fetch-Site": "cross-site"})[0], 403)
        status, body, headers = self.request("/api/admin/session")
        self.assertEqual(status, 200)
        self.assertEqual(body["token"], self.server.csrf)
        self.assertIn("HttpOnly; SameSite=Strict", headers["Set-Cookie"])
        for headers in [{"Origin": "https://example.invalid"}, {"X-Workshop-Token": "wrong"}]:
            self.assertEqual(self.request("/api/admin/settings", "PUT", {}, headers, admin=True)[0], 403)

    def test_independent_admin_page_without_static_admin_file(self):
        self.assertFalse((self.site / "admin").exists())
        status, body, headers = self.request("/admin/prints/")
        self.assertEqual(status, 200)
        self.assertIn(b'data-workshop="admin"', body)
        self.assertIn(b'src="/app.js"', body)
        self.assertIn(b'href="/style.css"', body)
        self.assertEqual(headers["Cache-Control"], "no-store")

    def test_quote_and_invalid_configuration(self):
        product = next(p for p in self.store.get_entries() if p["kind"] == "product")
        query = f'/api/quote?id={product["id"]}&color={product["colors"][0]["id"]}&infill='
        status, quote, _ = self.request(query+"50")
        self.assertEqual((status, quote["price"], quote["quantity"]), (200, 53, 1))
        for fill in ["14", "101", "15.5", "oops"]:
            self.assertEqual(self.request(query+fill)[0], 400)

    def test_full_crud_upload_and_private_source(self):
        status, image, _ = self.request("/api/admin/assets", "POST", PNG, {"X-Filename": "test.png"}, admin=True)
        self.assertEqual(status, 201)
        self.assertEqual(self.request(image["url"])[1], PNG)
        _, source, _ = self.request("/api/admin/assets", "POST", source_3mf(), {"X-Filename": "test.3mf"}, admin=True)
        self.assertIsNone(source["url"])
        self.assertEqual(self.request(f'/workshop-media/{source["id"]}.3mf')[0], 404)
        status, entry, _ = self.request("/api/admin/entries", "POST", {"name": "HTTP test", "kind": "work", "status": "published", "image_ids": [image["id"]], "source_id": source["id"]}, admin=True)
        self.assertEqual(status, 201)
        status, entry, _ = self.request(f'/api/admin/entries/{entry["id"]}', "PUT", dict(entry, name="Updated"), admin=True)
        self.assertEqual((status, entry["revision"]), (200, 2))
        self.assertEqual(self.request(f'/api/entry/{entry["id"]}')[1]["name"], "Updated")
        self.assertEqual(self.request(f'/api/admin/entries/{entry["id"]}', "DELETE", {"revision": 2}, admin=True)[0], 200)
        self.assertEqual(self.request(f'/api/entry/{entry["id"]}')[0], 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
