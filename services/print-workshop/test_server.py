"""Behavior tests use temporary databases/files; never modify the real workshop."""
import base64
import http.client
import io
import json
import sqlite3
import struct
import tempfile
import threading
import unittest
import zipfile
from contextlib import closing
from decimal import Decimal, ROUND_HALF_UP
from pathlib import Path

from demo import seed, vase_glb
from server import Handler, Problem, Server, Store, price, weight_at

PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aR1kAAAAASUVORK5CYII=")
MP4 = b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"


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


class WeightTests(unittest.TestCase):
    def test_endpoints_midpoint_and_unset_weights(self):
        self.assertEqual(weight_at(60, 180, 15), 60)
        self.assertEqual(weight_at(60, 180, 50), 109.41)
        self.assertEqual(weight_at(60, 180, 100), 180)
        self.assertEqual(weight_at(42.35, 180.75, 50), 99.34)
        self.assertIsNone(weight_at(None, None, 50))

    def test_all_fill_steps_match_decimal_interpolation(self):
        for low, high in [(60, 180), (.01, .99), (12.34, 876.54), (1_000_000, 1_000_000)]:
            values = []
            for fill in range(15, 101):
                expected = (Decimal(str(low)) + (Decimal(str(high)) - Decimal(str(low)))
                            * Decimal(fill - 15) / Decimal(85)).quantize(Decimal('.01'), rounding=ROUND_HALF_UP)
                values.append(weight_at(low, high, fill))
                self.assertEqual(Decimal(str(values[-1])), expected)
            self.assertEqual(values, sorted(values))

    def test_rejects_invalid_weight_endpoints_and_fill(self):
        for values in [(0, 1, 15), (-1, 1, 15), (10, 9, 50), (True, 100, 50),
                       (float('nan'), 100, 50), (1, float('inf'), 50), (.001, 1, 50),
                       (1, 1_000_001, 50), (1, 100, 14), (1, 100, 101), (1, 100, 50.5)]:
            with self.subTest(values=values), self.assertRaises(Problem):
                weight_at(*values)


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.store = Store(self.temp.name)
        self.image = self.store.save_asset("cover.png", PNG)
        self.model = self.store.save_asset("vase.glb", vase_glb())
        self.color = self.store.save_color({"name": "测试绿", "hex": "#87b89e"})

    def tearDown(self):
        self.temp.cleanup()

    def configurable(self, **changes):
        return dict({"name": "测试可选", "kind": "work", "status": "published", "image_ids": [self.image["id"]], "model_id": self.model["id"], "color_ids": [self.color["id"]], "min_price": 20, "max_price": 105}, **changes)

    def test_persistence_including_file_and_qr(self):
        entry = self.store.save_entry(self.configurable())
        self.store.save_settings({"qq_asset": self.image["id"]})
        reopened = Store(self.temp.name)
        self.assertEqual(reopened.get_entry(entry["id"])["name"], "测试可选")
        self.assertEqual(reopened.settings()["qq_image"]["id"], self.image["id"])
        self.assertEqual((reopened.media / f'{self.image["id"]}.png').read_bytes(), PNG)

    def test_publish_rules_and_mutually_exclusive_kind(self):
        for changes in [{"image_ids": []}, {"color_ids": []}, {"kind": "both"}]:
            with self.subTest(changes=changes), self.assertRaises(Problem):
                self.store.save_entry(self.configurable(**changes))
        work = self.store.save_entry(self.configurable(model_id=None))
        self.assertIsNone(work["model"])
        draft = self.store.save_entry(self.configurable(status="draft", model_id=None))
        self.assertNotIn(draft["id"], [e["id"] for e in self.store.get_entries()])

    def test_stock_uses_fixed_price_weight_without_model_or_configurations(self):
        entry = self.store.save_entry(self.configurable(kind="product", model_id=None,
            fixed_price=39, weight_g=120, min_price=20, max_price=100))
        self.assertEqual((entry["fixed_price"], entry["weight_g"]), (39, 120))
        self.assertEqual((entry["color_ids"], entry["colors"], entry["min_price"], entry["max_price"]), ([], [], 0, 0))
        self.assertIsNone(entry["model"])
        reopened = Store(self.temp.name).get_entry(entry["id"])
        self.assertEqual((reopened["fixed_price"], reopened["weight_g"]), (39, 120))

    def test_configurable_weight_endpoints_persist_and_stock_clears_them(self):
        entry = self.store.save_entry(self.configurable(min_weight_g=42.35, max_weight_g=180.75))
        reopened = Store(self.temp.name).get_entry(entry['id'])
        self.assertEqual((reopened['min_weight_g'], reopened['max_weight_g']), (42.35, 180.75))
        stock = self.store.save_entry(dict(entry, kind='product', fixed_price=39, weight_g=120), entry['id'])
        self.assertIsNone(stock['min_weight_g'])
        self.assertIsNone(stock['max_weight_g'])

    def test_configurable_weight_pair_validation_allows_incomplete_drafts(self):
        for changes in [dict(min_weight_g=60), dict(max_weight_g=180),
                        dict(min_weight_g=180, max_weight_g=60),
                        dict(min_weight_g=60.001, max_weight_g=180)]:
            with self.subTest(changes=changes), self.assertRaises(Problem):
                self.store.save_entry(self.configurable(**changes))
        draft = self.store.save_entry(self.configurable(status='draft', min_weight_g=60))
        self.assertEqual(draft['min_weight_g'], 60)
        self.assertIsNone(draft['max_weight_g'])

    def test_stock_requires_positive_weight_and_accepts_pending_price(self):
        for changes in [{"fixed_price":-1}, {"fixed_price":True},
                        {"fixed_price":1.5}, {"weight_g":None}, {"weight_g":0},
                        {"weight_g":-1}, {"weight_g":True}, {"weight_g":float("inf")},
                        {"weight_g":float("nan")}, {"weight_g":1_000_001}]:
            with self.subTest(changes=changes), self.assertRaises(Problem):
                self.store.save_entry(self.configurable(**{"kind":"product", "fixed_price":39, "weight_g":120, **changes}))
        draft=self.store.save_entry(self.configurable(kind="product",status="draft"))
        self.assertIsNone(draft["fixed_price"])
        self.assertIsNone(draft["weight_g"])
        published = self.store.save_entry(self.configurable(kind="product", fixed_price=None, weight_g=320))
        self.assertIsNone(self.store.get_entry(published["id"])["fixed_price"])
        self.store.save_entry(dict(published, fixed_price=39), published["id"])
        self.assertEqual(self.store.get_entry(published["id"])["fixed_price"], 39)

    def test_topic_stock_can_be_priced_before_weight_is_known(self):
        data = self.configurable(kind="product", topic="expedition-33")
        entry = self.store.save_entry(data)
        published = self.store.get_entry(entry["id"])
        self.assertEqual((published["topic"], published["fixed_price"], published["weight_g"]),
                         ("expedition-33", None, None))
        priced = self.store.save_entry(dict(entry, fixed_price=15, fixed_infill=100), entry["id"])
        self.assertEqual((priced["fixed_price"], priced["weight_g"], priced["fixed_infill"]), (15, None, 100))
        with self.assertRaises(Problem):
            self.store.save_entry(dict(priced, fixed_infill=101), priced["id"])
        with self.assertRaises(Problem):
            self.store.save_entry(dict(priced, topic=""), priced["id"])

    def test_revision_conflict_and_unpublish(self):
        entry = self.store.save_entry(self.configurable())
        updated = self.store.save_entry(dict(entry, status="archived"), entry["id"])
        self.assertEqual(updated["revision"], 2)
        with self.assertRaises(Problem) as error:
            self.store.save_entry(entry, entry["id"])
        self.assertEqual(error.exception.status, 409)
        with self.assertRaises(Problem):
            self.store.get_entry(entry["id"])
        self.assertEqual(self.store.get_entries(), [])

    def test_color_reference_guard_and_delete(self):
        entry = self.store.save_entry(self.configurable())
        with self.assertRaises(Problem):
            self.store.save_color({"name": "停用", "hex": "#87b89e", "active": False}, self.color["id"])
        with self.assertRaises(Problem):
            self.store.delete_entry(entry["id"], 0)
        self.store.delete_entry(entry["id"], entry["revision"])
        self.store.save_color({"name": "停用", "hex": "#87b89e", "active": False}, self.color["id"])
        self.assertEqual(self.store.get_entries(True), [])

    def test_source_preserved_without_public_url(self):
        source = self.store.save_asset("bambu.3mf", source_3mf())
        entry = self.store.save_entry(self.configurable(source_id=source["id"]))
        self.assertIsNone(entry["source"]["url"])
        self.assertNotIn("source_id", self.store.get_entry(entry["id"]))
        self.assertNotIn("source", self.store.get_entry(entry["id"]))

    def test_video_upload_persists_and_gets_public_url(self):
        video = self.store.save_asset("clip.mp4", MP4)
        entry = self.store.save_entry(self.configurable(video_ids=[video["id"]]))
        self.assertEqual(entry["videos"], [video])
        self.assertEqual(video["kind"], "video")
        self.assertTrue(video["url"].endswith(".mp4"))
        reopened = Store(self.temp.name)
        self.assertEqual(reopened.get_entry(entry["id"])["videos"][0]["id"], video["id"])

    def test_upload_rejections_and_invalid_reference(self):
        for name, body in [("bad.png", b"bad"), ("bad.mp4", b"bad"), ("bad.webm", b"bad"), ("bad.glb", b"bad"), ("bad.3mf", b"bad"), ("script.svg", b"<svg/>"), ("empty.png", b"")]:
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

    def test_initial_collection_uses_regular_entries_and_is_seeded_only_once(self):
        seed(self.store)
        self.assertEqual(len(self.store.get_entries(True)), 2)
        for item in self.store.get_entries(True):
            self.assertFalse(item["is_demo"])
            self.assertNotIn("演示", item["description"])
            self.assertNotIn("示例", item["description"])
            for image in item["images"]:
                data = (self.store.media / f'{image["id"]}.{image["ext"]}').read_bytes()
                self.assertNotIn(b"DEMO", data)
            self.store.delete_entry(item["id"], item["revision"])
        seed(Store(self.temp.name))
        self.assertEqual(self.store.get_entries(True), [])

    def test_material_follows_color_and_stock_keeps_its_own_value(self):
        color = self.store.save_color(dict(self.color, material=" PLA ", active=True), self.color["id"])
        work = self.store.save_entry(self.configurable(material="ignored"))
        stock = self.store.save_entry(self.configurable(kind="product", fixed_price=39, weight_g=120, material="TPU"))
        self.assertEqual(work["material"], "")
        self.assertEqual(work["colors"][0]["material"], "PLA")
        self.store.save_color(dict(color, material="PETG", active=True), color["id"])
        self.assertEqual(self.store.get_entry(work["id"])["colors"][0]["material"], "PETG")
        self.assertEqual(Store(self.temp.name).get_entry(stock["id"])["material"], "TPU")
        self.store.save_color({"name": color["name"], "hex": color["hex"]}, color["id"])
        self.assertEqual(self.store.colors()[0]["material"], "PETG")
        converted = self.store.save_entry(dict(stock, kind="work", color_ids=[color["id"]]), stock["id"])
        self.assertEqual(converted["material"], "")
        self.assertEqual(converted["colors"][0]["material"], "PETG")

    def test_material_rejects_invalid_text_and_supports_clearing(self):
        for invalid in [None, 123, [], {}, "a" * 81]:
            with self.subTest(value=invalid), self.assertRaises(Problem):
                self.store.save_color({"name": "color", "hex": "#ffffff", "material": invalid})
            with self.subTest(value=invalid), self.assertRaises(Problem):
                self.store.save_entry(self.configurable(kind="product", fixed_price=39, weight_g=120, material=invalid))
        color = self.store.save_color(dict(self.color, material="", active=True), self.color["id"])
        self.assertEqual(color["material"], "")

    def test_legacy_color_database_migrates_without_losing_records(self):
        with tempfile.TemporaryDirectory() as folder:
            with closing(sqlite3.connect(Path(folder) / "workshop.sqlite3")) as db, db:
                db.execute("CREATE TABLE colors(id TEXT PRIMARY KEY, name TEXT NOT NULL, hex TEXT NOT NULL, active INTEGER NOT NULL)")
                db.execute("INSERT INTO colors VALUES ('legacy','old white','#FFFFFF',1)")
            migrated = Store(folder)
            self.assertEqual(migrated.colors(), [{"id":"legacy", "name":"old white", "hex":"#FFFFFF", "active":1, "material":""}])
            migrated.save_color({"name":"old white", "hex":"#FFFFFF", "material":"PLA"}, "legacy")
            self.assertEqual(Store(folder).colors()[0]["material"], "PLA")


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
        product = next(p for p in self.store.get_entries() if p["kind"] == "work")
        query = f'/api/quote?id={product["id"]}&color={product["colors"][0]["id"]}&infill='
        status, quote, _ = self.request(query+"50")
        self.assertEqual((status, quote["price"], quote["quantity"]), (200, 53, 1))
        self.assertEqual(quote['weight_g'], 109.41)
        self.assertEqual(quote['material'], 'PLA')
        color = product['colors'][0]
        self.store.save_color(dict(color, material='PETG', active=True), color['id'])
        self.assertEqual(self.request(query+'50')[1]['material'], 'PETG')
        for fill in ["14", "101", "15.5", "oops"]:
            self.assertEqual(self.request(query+fill)[0], 400)

    def test_stock_quote_remains_fixed_even_with_configuration_query_parameters(self):
        stock=next(p for p in self.store.get_entries() if p["kind"]=="product")
        for query in ["", "&color=unknown&infill=100", "&infill=oops"]:
            status, result, _=self.request(f'/api/quote?id={stock["id"]}'+query)
            self.assertEqual((status,result["price"],result["weight_g"]),(200,39,120))
            self.assertEqual(result['material'], 'PLA')
            self.assertNotIn("color",result)
            self.assertNotIn("infill",result)

    def test_configurable_fixed_infill_applies_to_older_links_and_quotes(self):
        template = next(entry for entry in self.store.get_entries() if entry["kind"] == "work")
        entry = self.store.save_entry(dict(template, name="Fixed infill", fixed_infill=50))
        self.addCleanup(self.store.delete_entry, entry["id"], entry["revision"])
        query = f'/api/quote?id={entry["id"]}&color={entry["colors"][0]["id"]}'
        for fill in ("", "&infill=15", "&infill=90", "&infill=old"):
            with self.subTest(fill=fill):
                status, quote, _ = self.request(query + fill)
                self.assertEqual((status, quote["infill"], quote["price"], quote["weight_g"]), (200, 50, 53, 109.41))

    def test_quote_prefers_the_weight_saved_for_fixed_infill(self):
        template = next(entry for entry in self.store.get_entries() if entry["kind"] == "work")
        entry = self.store.save_entry(dict(template, name="Estimated weight", fixed_infill=50, weight_g=320))
        self.addCleanup(self.store.delete_entry, entry["id"], entry["revision"])
        status, quote, _ = self.request(f'/api/quote?id={entry["id"]}&color={entry["colors"][0]["id"]}&infill=15')
        self.assertEqual((status, quote["infill"], quote["weight_g"]), (200, 50, 320))

    def test_work_quote_uses_selected_color_price_with_default_for_other_colors(self):
        template = next(entry for entry in self.store.get_entries() if entry["kind"] == "work")
        first, second, third = template["color_ids"][:3]
        entry = self.store.save_entry(dict(template, name="Color pricing", fixed_infill=50,
                                           color_prices={first:65, second:60}))
        self.addCleanup(self.store.delete_entry, entry["id"], entry["revision"])
        for color_id, expected in ((first,65), (second,60), (third,53)):
            with self.subTest(color=color_id):
                status, quote, _ = self.request(f'/api/quote?id={entry["id"]}&color={color_id}')
                self.assertEqual((status, quote["infill"], quote["price"]), (200, 50, expected))

    def test_full_crud_upload_and_private_source(self):
        status, image, _ = self.request("/api/admin/assets", "POST", PNG, {"X-Filename": "test.png"}, admin=True)
        self.assertEqual(status, 201)
        self.assertEqual(self.request(image["url"])[1], PNG)
        _, video, _ = self.request("/api/admin/assets", "POST", MP4, {"X-Filename": "clip.mp4"}, admin=True)
        self.assertEqual(self.request(video["url"])[1], MP4)
        status, chunk, headers = self.request(video["url"], headers={"Range": "bytes=0-7"})
        self.assertEqual((status, chunk, headers["Content-Range"]), (206, MP4[:8], f"bytes 0-7/{len(MP4)}"))
        self.assertEqual(headers["Accept-Ranges"], "bytes")
        _, source, _ = self.request("/api/admin/assets", "POST", source_3mf(), {"X-Filename": "test.3mf"}, admin=True)
        self.assertIsNone(source["url"])
        self.assertEqual(self.request(f'/workshop-media/{source["id"]}.3mf')[0], 404)
        status, entry, _ = self.request("/api/admin/entries", "POST", {"name": "HTTP test", "kind": "product", "fixed_price": 39, "weight_g": 120, "status": "published", "image_ids": [image["id"]], "video_ids": [video["id"]], "source_id": source["id"]}, admin=True)
        self.assertEqual(status, 201)
        status, entry, _ = self.request(f'/api/admin/entries/{entry["id"]}', "PUT", dict(entry, name="Updated"), admin=True)
        self.assertEqual((status, entry["revision"]), (200, 2))
        self.assertEqual(self.request(f'/api/entry/{entry["id"]}')[1]["name"], "Updated")
        self.assertEqual(self.request(f'/api/admin/entries/{entry["id"]}', "DELETE", {"revision": 2}, admin=True)[0], 200)
        self.assertEqual(self.request(f'/api/entry/{entry["id"]}')[0], 404)


if __name__ == "__main__":
    unittest.main(verbosity=2)
