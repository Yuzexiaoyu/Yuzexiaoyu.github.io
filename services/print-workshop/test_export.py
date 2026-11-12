import json
import tempfile
import unittest
from pathlib import Path

from demo import vase_glb
from export_public import export_public, verify_snapshot
from server import Store
from test_server import PNG, source_3mf


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.store = Store(self.folder / "private")
        self.output = self.folder / "public"
        self.image = self.store.save_asset("private-filename.png", PNG)
        self.model = self.store.save_asset("preview.glb", vase_glb())
        self.original = self.store.save_asset("original.3mf", source_3mf())
        self.color = self.store.save_color({"name": "测试绿", "hex": "#87B89E"})
        self.product = self.store.save_entry({"name": "Published product", "kind": "product", "status": "published",
            "image_ids": [self.image["id"]], "model_id": self.model["id"], "source_id": self.original["id"],
            "color_ids": [self.color["id"]], "min_price": 20, "max_price": 105})

    def tearDown(self):
        self.temp.cleanup()

    def test_only_public_content_and_referenced_preview_assets_are_exported(self):
        self.store.save_entry({"name": "PRIVATE DRAFT", "kind": "work", "status": "draft"})
        self.store.save_entry({"name": "PRIVATE ARCHIVE", "kind": "work", "status": "archived"})
        self.store.save_settings({"qq_asset": self.image["id"]})
        payload = export_public(self.store.folder, self.output)
        self.assertEqual([entry["id"] for entry in payload["entries"]], [self.product["id"]])
        raw = (self.output / "catalog.json").read_text(encoding="utf-8")
        for private in ["PRIVATE", "source_id", "original.3mf", self.original["id"], "private-filename"]:
            self.assertNotIn(private, raw)
        self.assertEqual(len(list((self.output / "media").iterdir())), 2)
        self.assertEqual(verify_snapshot(self.output), payload)
        self.assertTrue((self.store.media / f'{self.original["id"]}.3mf').exists())

    def test_unpublishing_removes_previous_public_content_and_unused_assets(self):
        export_public(self.store.folder, self.output)
        self.store.save_entry(dict(self.product, status="archived"), self.product["id"])
        payload = export_public(self.store.folder, self.output)
        self.assertEqual(payload["entries"], [])
        self.assertEqual(list((self.output / "media").iterdir()), [])

    def test_broken_local_asset_preserves_previous_valid_export(self):
        export_public(self.store.folder, self.output)
        before = (self.output / "catalog.json").read_bytes()
        (self.store.media / f'{self.model["id"]}.glb').write_bytes(b"broken")
        with self.assertRaises(ValueError):
            export_public(self.store.folder, self.output)
        self.assertEqual((self.output / "catalog.json").read_bytes(), before)
        verify_snapshot(self.output)

    def test_rejects_missing_database_and_unrelated_output_folder(self):
        with self.assertRaises(ValueError):
            export_public(self.folder / "missing", self.output)
        self.assertFalse(self.output.exists())
        self.output.mkdir()
        protected = self.output / "unrelated.txt"
        protected.write_text("preserve")
        with self.assertRaises(FileNotFoundError):
            export_public(self.store.folder, self.output)
        self.assertEqual(protected.read_text(), "preserve")


if __name__ == "__main__":
    unittest.main()
