import hashlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from PIL import Image

from demo import vase_glb
from export_public import export_public, verify_snapshot
from server import Store
from test_server import MP4, source_3mf


def image_bytes(image, image_format="PNG", **options):
    encoded = io.BytesIO()
    image.save(encoded, format=image_format, **options)
    return encoded.getvalue()


class ExportTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.folder = Path(self.temp.name)
        self.store = Store(self.folder / "private")
        self.output = self.folder / "public"
        self.png = image_bytes(Image.new("RGB", (16, 12), "#397752"))
        self.image = self.store.save_asset("private-filename.png", self.png)
        self.model = self.store.save_asset("preview.glb", vase_glb())
        self.video = self.store.save_asset("preview.mp4", MP4)
        self.original = self.store.save_asset("original.3mf", source_3mf())
        self.color = self.store.save_color({"name": "测试绿", "hex": "#87B89E"})
        self.product = self.store.save_entry({"name": "Published product", "kind": "product", "status": "published",
            "image_ids": [self.image["id"]], "video_ids": [self.video["id"]], "model_id": self.model["id"], "source_id": self.original["id"],
            "color_ids": [self.color["id"]], "fixed_price": 39, "weight_g": 120})

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
        product_image = payload["entries"][0]["images"][0]
        qr = payload["settings"]["qq_image"]
        self.assertNotEqual(product_image["id"], qr["id"])
        self.assertEqual(qr["id"], self.image["id"])
        self.assertEqual(qr["url"], f'/workshop/media/{self.image["id"]}.png')
        self.assertEqual((self.output / "media" / Path(qr["url"]).name).read_bytes(), self.png)
        self.assertEqual(len(list((self.output / "media").iterdir())), 4)
        self.assertEqual(verify_snapshot(self.output), payload)
        self.assertEqual((payload["entries"][0]["fixed_price"], payload["entries"][0]["weight_g"]), (39, 120))
        self.assertTrue((self.store.media / f'{self.original["id"]}.3mf').exists())

    def test_unpublishing_removes_previous_public_content_and_unused_assets(self):
        export_public(self.store.folder, self.output)
        self.store.save_entry(dict(self.product, status="archived"), self.product["id"])
        payload = export_public(self.store.folder, self.output)
        self.assertEqual(payload["entries"], [])
        self.assertEqual(list((self.output / "media").iterdir()), [])

    def test_approved_video_pair_is_shared_and_remaps_color_previews(self):
        original_id = self.video["id"]
        encodings = self.store.folder / "video-encodings" / original_id
        encodings.mkdir(parents=True)
        h264 = MP4 + b"\x00\x00\x00\x08free"
        av1 = b"\x1a\x45\xdf\xa3\x87\x42\x82\x84webm"
        (encodings / "h264.mp4").write_bytes(h264)
        (encodings / "av1.webm").write_bytes(av1)
        h264_id = hashlib.sha256(h264).hexdigest()
        av1_id = hashlib.sha256(av1).hexdigest()

        fallback_data = MP4 + b"\x00\x00\x00\x08skip"
        fallback = self.store.save_asset("unconfigured.mp4", fallback_data)
        color_id = self.color["id"]
        work = self.store.save_entry({
            "name": "Shared videos", "kind": "work", "status": "published",
            "image_ids": [self.image["id"]], "color_ids": [color_id],
            "video_ids": [original_id, fallback["id"]],
            "color_previews": {color_id: {"image_ids": [], "video_ids": [original_id, fallback["id"]]}},
        })
        payload = export_public(self.store.folder, self.output)
        self.assertEqual(verify_snapshot(self.output), payload)
        entries = {entry["id"]: entry for entry in payload["entries"]}
        primary, unchanged = entries[work["id"]]["videos"]
        self.assertEqual(entries[self.product["id"]]["videos"], [primary])
        self.assertEqual((primary["id"], primary["size"], primary["url"]),
                         (h264_id, len(h264), f"/workshop/media/{h264_id}.mp4"))
        self.assertEqual(primary["av1"], {"url": f"/workshop/media/{av1_id}.webm", "size": len(av1)})
        self.assertEqual(entries[work["id"]]["color_previews"][color_id]["video_ids"], [h264_id, fallback["id"]])
        self.assertEqual((unchanged["id"], unchanged["size"], unchanged["url"]),
                         (fallback["id"], len(fallback_data), f'/workshop/media/{fallback["id"]}.mp4'))
        self.assertNotIn("av1", unchanged)

        media = self.output / "media"
        self.assertEqual((media / f"{h264_id}.mp4").read_bytes(), h264)
        self.assertEqual((media / f'{fallback["id"]}.mp4').read_bytes(), fallback_data)
        self.assertFalse((media / f"{original_id}.mp4").exists())
        alternative = media / f"{av1_id}.webm"
        self.assertEqual(alternative.read_bytes(), av1)
        alternative.write_bytes(av1[:-1] + b"x")
        with self.assertRaises(ValueError):
            verify_snapshot(self.output)

    def test_topic_survives_older_editor_updates_and_can_be_removed(self):
        entry_id = self.product["id"]
        assigned = self.store.save_entry(dict(self.product, topic="expedition-33", topic_only=True, fixed_infill=100,
                                              weight_g=7, weight_approximate=True), entry_id)
        previous_editor = {key: value for key, value in assigned.items() if key not in {"topic", "topic_only", "fixed_infill", "weight_approximate"}}
        saved = self.store.save_entry(previous_editor, entry_id)
        exported = export_public(self.store.folder, self.output)["entries"][0]
        self.assertEqual((exported["topic"], exported["fixed_infill"]), ("expedition-33", 100))
        self.assertTrue(exported["topic_only"])
        self.assertEqual(exported["weight_g"], 7)
        self.assertTrue(exported["weight_approximate"])
        self.store.save_entry(dict(saved, topic=""), entry_id)
        unassigned = export_public(self.store.folder, self.output)["entries"][0]
        self.assertNotIn("topic", unassigned)
        self.assertNotIn("topic_only", unassigned)

    def test_configurable_weights_and_multiple_images_are_exported_in_order(self):
        second = self.store.save_asset('second.svg', b'<svg xmlns="http://www.w3.org/2000/svg" width="10" height="20"/>', trusted_demo=True)
        work = self.store.save_entry({'name':'Configurable', 'kind':'work', 'status':'published',
            'image_ids':[self.image['id'], second['id']], 'color_ids':[self.color['id']],
            'min_weight_g':60, 'max_weight_g':180, 'fixed_infill':50, 'weight_g':320,
            'color_prices':{self.color['id']:65, 'unused':99}})
        payload = export_public(self.store.folder, self.output)
        exported = next(entry for entry in payload['entries'] if entry['id'] == work['id'])
        self.assertEqual((exported['min_weight_g'], exported['max_weight_g']), (60, 180))
        self.assertEqual(exported['fixed_infill'], 50)
        self.assertEqual(exported['weight_g'], 320)
        self.assertEqual(exported['color_prices'], {self.color['id']:65})
        stock = next(entry for entry in payload['entries'] if entry['id'] == self.product['id'])
        self.assertEqual(exported['images'][0], stock['images'][0])
        self.assertNotEqual(exported['images'][0]['id'], self.image['id'])
        svg = exported['images'][1]
        self.assertEqual([image['id'] for image in exported['images']], [stock['images'][0]['id'], second['id']])
        self.assertEqual(svg['url'], f'/workshop/media/{second["id"]}.svg')
        self.assertEqual((self.output / 'media' / Path(svg['url']).name).read_bytes(),
                         (self.store.media / f'{second["id"]}.svg').read_bytes())
        verify_snapshot(self.output)

    def test_product_images_fit_inside_1280_and_use_webp_quality_80(self):
        landscape = self.store.save_asset("landscape.jpg", image_bytes(Image.new("RGB", (1600, 800), "blue"), "JPEG"))
        portrait = self.store.save_asset("portrait.webp", image_bytes(Image.new("RGBA", (800, 1600), (50, 90, 30, 113)),
                                                                       "WEBP", lossless=True))
        fixtures = [
            (self.image, (16, 12), 255),
            (landscape, (1280, 640), 255),
            (portrait, (640, 1280), 113),
        ]
        self.store.save_entry(dict(self.product, image_ids=[asset["id"] for asset, _, _ in fixtures]), self.product["id"])
        # The WebP container does not record the encoder's quality setting.
        with patch.object(Image.Image, "save", autospec=True, side_effect=Image.Image.save) as save:
            payload = export_public(self.store.folder, self.output)
        self.assertTrue(save.called)
        self.assertEqual({call.kwargs.get("quality") for call in save.call_args_list}, {80})
        images = payload["entries"][0]["images"]
        self.assertEqual(len(images), len(fixtures))
        for public, (source, dimensions, alpha) in zip(images, fixtures):
            with self.subTest(dimensions=dimensions):
                data = (self.output / "media" / Path(public["url"]).name).read_bytes()
                digest = hashlib.sha256(data).hexdigest()
                self.assertNotEqual(digest, source["id"])
                self.assertEqual(public["id"], digest)
                self.assertEqual(public["url"], f"/workshop/media/{digest}.webp")
                self.assertEqual(public["size"], len(data))
                with Image.open(io.BytesIO(data)) as decoded:
                    self.assertEqual((decoded.format, decoded.size), ("WEBP", dimensions))
                    self.assertEqual(decoded.convert("RGBA").getpixel((0, 0))[3], alpha)

    def test_product_image_preserves_transparent_animation_frames_and_timing(self):
        frames = []
        for color in ("red", "blue"):
            frame = Image.new("RGBA", (24, 16), (0, 0, 0, 0))
            frame.paste(color, (8, 0, 24, 16))
            frames.append(frame)
        data = image_bytes(frames[0], save_all=True, append_images=frames[1:], duration=[120, 240], loop=2)
        source = self.store.save_asset("animated.png", data)
        self.store.save_entry(dict(self.product, image_ids=[source["id"]]), self.product["id"])
        exported = export_public(self.store.folder, self.output)["entries"][0]["images"][0]
        with Image.open(self.output / "media" / Path(exported["url"]).name) as result:
            self.assertEqual((result.format, result.size, result.n_frames), ("WEBP", (24, 16), 2))
            self.assertEqual(result.info["loop"], 2)
            for index, duration in enumerate([120, 240]):
                result.seek(index)
                rgba = result.convert("RGBA")
                self.assertEqual(result.info["duration"], duration)
                self.assertEqual(rgba.getpixel((2, 8))[3], 0)
                red, _, blue, alpha = rgba.getpixel((18, 8))
                self.assertEqual(alpha, 255)
                self.assertGreater(red if index == 0 else blue, 220)
                self.assertLess(blue if index == 0 else red, 35)

    def test_broken_local_asset_preserves_previous_valid_export(self):
        export_public(self.store.folder, self.output)
        before = (self.output / "catalog.json").read_bytes()
        (self.store.media / f'{self.model["id"]}.glb').write_bytes(b"broken")
        with self.assertRaises(ValueError):
            export_public(self.store.folder, self.output)
        self.assertEqual((self.output / "catalog.json").read_bytes(), before)
        verify_snapshot(self.output)

    def test_watched_export_restores_catalog_and_media_when_removing_an_old_photo_fails(self):
        second = self.store.save_asset("second.png", image_bytes(Image.new("RGB", (16, 12), "red")))
        product = self.store.save_entry(dict(self.product, image_ids=[self.image["id"], second["id"]]), self.product["id"])
        before = export_public(self.store.folder, self.output)
        catalog = self.output / "catalog.json"
        media = self.output / "media"
        old_catalog = catalog.read_bytes()
        old_media = {path.name: path.read_bytes() for path in media.iterdir()}
        old_photos = {media / Path(photo["url"]).name for photo in before["entries"][0]["images"]}

        replacement = self.store.save_asset("new.png", image_bytes(Image.new("RGB", (16, 12), "blue")))
        self.store.save_entry(dict(product, image_ids=[replacement["id"]]), product["id"])
        rename = Path.rename
        moved_photos = []

        def simulate_windows_locks(source, target):
            if source == self.output:
                error = PermissionError("Hugo is watching the output directory")
                error.winerror = 5
                raise error
            if source in old_photos:
                if moved_photos:
                    self.assertFalse(moved_photos[0].exists())
                    self.assertNotEqual(catalog.read_bytes(), old_catalog)
                    raise PermissionError("obsolete photo is open")
                moved_photos.append(source)
            return rename(source, target)

        with patch.object(Path, "rename", simulate_windows_locks):
            with self.assertRaisesRegex(PermissionError, "obsolete photo is open"):
                export_public(self.store.folder, self.output)
        self.assertEqual(catalog.read_bytes(), old_catalog)
        self.assertEqual({path.name: path.read_bytes() for path in media.iterdir()}, old_media)
        self.assertEqual(verify_snapshot(self.output), before)

    def test_color_preview_references_only_current_public_media(self):
        color_id = self.color["id"]
        white = self.store.save_color({"name": "纯白", "hex": "#FFFFFF"})
        work = self.store.save_entry({"name": "Color previews", "kind": "work", "status": "published",
            "image_ids": [self.image["id"]], "video_ids": [self.video["id"]], "color_ids": [color_id, white["id"]],
            "color_previews": {
                color_id: {"image_ids": [self.image["id"], self.original["id"]], "video_ids": [self.video["id"]], "accent": "#ffaa11"},
                white["id"]: {"image_ids": [], "video_ids": []},
            }})
        work = self.store.save_entry(dict(work, video_ids=[]), work["id"])
        export_public(self.store.folder, self.output)
        entry = next(row for row in verify_snapshot(self.output)["entries"] if row["id"] == work["id"])
        public_image_id = entry["images"][0]["id"]
        self.assertNotEqual(public_image_id, self.image["id"])
        self.assertEqual(entry["color_previews"], {
            color_id: {"image_ids": [public_image_id], "video_ids": [], "accent": "#FFAA11"},
            white["id"]: {"image_ids": [], "video_ids": []},
        })

    def test_material_export_keeps_color_and_stock_sources_separate(self):
        self.store.save_entry(dict(self.product, material="TPU"), self.product["id"])
        self.store.save_color(dict(self.color, material="PETG", active=True), self.color["id"])
        self.store.save_entry({"name":"configurable", "kind":"work", "status":"published",
            "image_ids":[self.image["id"]], "color_ids":[self.color["id"]], "material":"ignored"})
        payload = export_public(self.store.folder, self.output)
        work = next(entry for entry in payload["entries"] if entry["kind"] == "work")
        stock = next(entry for entry in payload["entries"] if entry["kind"] == "product")
        self.assertEqual(work["material"], "")
        self.assertEqual(work["colors"][0]["material"], "PETG")
        self.assertEqual(stock["material"], "TPU")
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
