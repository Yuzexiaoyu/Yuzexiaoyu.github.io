"""Export only published customer content; the local database is never deployed."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
from contextlib import ExitStack
from io import BytesIO
from pathlib import Path

from server import ROOT, WORKSHOP_TOPICS, Problem, Store, integer, normalize_color_previews, normalize_color_prices, single_weight

ENTRY_FIELDS = {"id", "revision", "name", "description", "material", "kind", "status", "topic", "topic_only", "min_price", "max_price", "fixed_price", "fixed_infill", "weight_g", "weight_approximate", "min_weight_g", "max_weight_g", "is_demo", "updated_at", "color_previews", "color_prices"}
ASSET_NAME = re.compile(r"[0-9a-f]{64}\.(?:png|jpg|jpeg|webp|svg|mp4|webm|mov|glb)")


def verify_snapshot(folder):
    folder = Path(folder).resolve()
    payload = json.loads((folder / "catalog.json").read_text(encoding="utf-8"))
    if set(payload) != {"version", "entries", "settings"} or payload["version"] != 1:
        raise ValueError("Unsupported public catalog")
    expected = {"catalog.json"}

    def check_file(url, size):
        filename = url.removeprefix("/workshop/media/")
        if not url.startswith("/workshop/media/") or not ASSET_NAME.fullmatch(filename):
            raise ValueError("Invalid public asset path")
        target = folder / "media" / filename
        if target.is_symlink() or target.resolve().parent != folder / "media":
            raise ValueError("Public asset must remain inside the export")
        data = target.read_bytes()
        if hashlib.sha256(data).hexdigest() != target.stem or len(data) != size:
            raise ValueError("Public asset integrity mismatch")
        expected.add("media/" + filename)
        return target

    def check_asset(asset):
        if asset is None:
            return
        fields = {"id", "name", "url", "kind", "size"}
        if "av1" in asset and asset.get("kind") == "video":
            fields.add("av1")
        if set(asset) != fields or asset["kind"] not in ("image", "video", "model"):
            raise ValueError("Unexpected asset fields or private source")
        primary = check_file(asset["url"], asset["size"])
        if primary.stem != asset["id"]:
            raise ValueError("Public asset ID does not match its file")
        if "av1" in asset:
            variant = asset["av1"]
            if primary.suffix != ".mp4" or set(variant) != {"url", "size"} or not variant["url"].endswith(".webm"):
                raise ValueError("Invalid public video encodings")
            check_file(variant["url"], variant["size"])

    for entry in payload["entries"]:
        if set(entry) - (ENTRY_FIELDS | {"images", "videos", "model", "colors"}) or entry["status"] != "published":
            raise ValueError("Private or unpublished entry in public catalog")
        if "topic" in entry and entry["topic"] not in WORKSHOP_TOPICS:
            raise ValueError("Invalid workshop topic")
        if "topic_only" in entry and (entry["topic_only"] is not True or not entry.get("topic")):
            raise ValueError("Topic-only visibility requires a workshop topic")
        if "weight_approximate" in entry:
            if entry["weight_approximate"] is not True or entry["kind"] != "product" or entry.get("weight_g") is None:
                raise ValueError("Approximate stock weight requires a weight value")
            try:
                single_weight(entry["weight_g"], "现货重量")
            except Problem as error:
                raise ValueError("Invalid approximate stock weight") from error
        if "fixed_infill" in entry:
            if entry["kind"] not in ("work", "product"):
                raise ValueError("Invalid entry kind for fixed infill")
            try:
                integer(entry["fixed_infill"], "固定填充比例", 15 if entry["kind"] == "work" else 0, 100)
                single_weight(entry.get("weight_g"), "固定填充重量")
            except Problem as error:
                raise ValueError("Invalid public fixed infill or weight") from error
        if "color_prices" in entry:
            prices = entry["color_prices"]
            try:
                normalized_prices = normalize_color_prices(prices, [color["id"] for color in entry["colors"]])
            except Problem as error:
                raise ValueError("Invalid public color prices") from error
            if entry["kind"] != "work" or prices != normalized_prices:
                raise ValueError("Invalid public color prices")
        for asset in entry["images"] + entry.get("videos", []):
            check_asset(asset)
        check_asset(entry["model"])
        if "color_previews" in entry:
            previews = entry["color_previews"]
            try:
                normalized = normalize_color_previews(previews, [color["id"] for color in entry["colors"]],
                                                      [image["id"] for image in entry["images"]],
                                                      [video["id"] for video in entry.get("videos", [])])
            except Problem as error:
                raise ValueError("Invalid public color previews") from error
            if entry["kind"] != "work" or previews != normalized:
                raise ValueError("Invalid public color previews")
    if set(payload["settings"]) != {"name", "qq_image"}:
        raise ValueError("Unexpected public settings")
    check_asset(payload["settings"]["qq_image"])
    actual = {path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file() or path.is_symlink()}
    if actual != expected:
        raise ValueError("Unexpected or missing files in public export")
    return payload


def encode_product_photo(data):
    # Only the local exporter encodes photos. CI can verify snapshots without Pillow.
    from PIL import Image, ImageCms, ImageOps

    with Image.open(BytesIO(data)) as source:
        icc = source.info.get("icc_profile")
        profile = ImageCms.ImageCmsProfile(BytesIO(icc)) if icc else None
        srgb = ImageCms.createProfile("sRGB") if profile else None
        # A multi-picture JPEG can contain an HDR gain map after the main photo.
        animated = source.format in ("PNG", "WEBP") and source.is_animated
        first_frame = int(animated and source.info.get("default_image", False))
        loop = source.info.get("loop", 0)
        frames, durations = [], []
        for index in range(first_frame, source.n_frames if animated else 1):
            source.seek(index)
            frame = ImageOps.exif_transpose(source)
            alpha = frame.convert("RGBA").getchannel("A") if frame.has_transparency_data else None
            if profile:
                colors = frame.getchannel("L") if frame.mode == "LA" else frame
                if colors.mode not in ("RGB", "CMYK", "L", "LAB"):
                    colors = colors.convert("RGB")
                frame = ImageCms.profileToProfile(colors, profile, srgb, outputMode="RGB")
            else:
                frame = frame.convert("RGB")
            if alpha is not None:
                frame.putalpha(alpha)
            frame.thumbnail((1280, 1280), Image.Resampling.LANCZOS)
            frame.info.clear()
            frames.append(frame)
            durations.append(source.info.get("duration", 0))
        options = {}
        if animated:
            options.update(save_all=True, append_images=frames[1:], duration=durations, loop=loop)
            if any(frame.mode == "RGBA" for frame in frames):
                # Delta-only frames can drop a transparent margin from the WebP canvas.
                options.update(kmin=0, kmax=1)
        encoded = BytesIO()
        frames[0].save(encoded, format="WEBP", quality=80, method=6, **options)
        return encoded.getvalue()


def build_snapshot(store, media):
    photos = {}
    videos = {}

    def public_asset(asset, *, product_photo=False):
        if asset is None:
            return None
        if asset["kind"] not in ("image", "video", "model"):
            raise ValueError("Original model files cannot be exported")
        filename = f'{asset["id"]}.{asset["ext"]}'
        if not ASSET_NAME.fullmatch(filename):
            raise ValueError("Unsupported public asset")
        source = store.media / filename
        if source.is_symlink() or source.resolve().parent != store.media:
            raise ValueError("Asset must remain inside local media storage")
        asset_id, size = asset["id"], asset["size"]
        if product_photo and asset["ext"] != "svg":
            if asset_id in photos:
                return photos[asset_id]
            original = source.read_bytes()
            if len(original) != size or hashlib.sha256(original).hexdigest() != asset_id:
                raise ValueError("Local product photo integrity mismatch")
            encoded = encode_product_photo(original)
            asset_id = hashlib.sha256(encoded).hexdigest()
            filename, size = asset_id + ".webp", len(encoded)
            (media / filename).write_bytes(encoded)
        elif not (media / filename).exists():
            shutil.copyfile(source, media / filename)
        names = {"image": "预览图片", "video": "预览视频", "model": "3D 预览"}
        result = {"id": asset_id, "name": names[asset["kind"]],
                  "url": "/workshop/media/" + filename, "kind": asset["kind"], "size": size}
        if product_photo:
            photos[asset["id"]] = result
        return result

    def public_video(asset):
        source_id = asset["id"]
        if source_id in videos:
            return videos[source_id]
        approved = store.folder / "video-encodings" / source_id
        if not approved.exists():
            result = public_asset(asset)
        else:
            if approved.resolve() != approved or not approved.is_dir():
                raise ValueError("Invalid approved video directory")
            versions = []
            for name in ("h264.mp4", "av1.webm"):
                version = approved / name
                if version.is_symlink() or not version.is_file():
                    raise ValueError(f"Missing approved video file: {name}")
                data = version.read_bytes()
                if ((name == "h264.mp4" and data[4:8] != b"ftyp") or
                        (name == "av1.webm" and not data.startswith(b"\x1a\x45\xdf\xa3"))):
                    raise ValueError(f"Invalid approved video container: {name}")
                digest = hashlib.sha256(data).hexdigest()
                filename = digest + version.suffix
                (media / filename).write_bytes(data)
                versions.append({"url": "/workshop/media/" + filename, "size": len(data)})
            h264, av1 = versions
            result = {"id": Path(h264["url"]).stem, "name": "预览视频", "kind": "video", **h264, "av1": av1}
        videos[source_id] = result
        return result

    entries = []
    for entry in store.get_entries():
        public = {key: entry[key] for key in sorted(ENTRY_FIELDS) if key in entry}
        public.update(images=[public_asset(asset, product_photo=True) for asset in entry["images"]],
                      videos=[public_video(asset) for asset in entry.get("videos", [])],
                      model=public_asset(entry["model"]), colors=entry["colors"])
        if "color_previews" in public:
            public["color_previews"] = {
                color: {**preview,
                        "image_ids": list(dict.fromkeys(photos[key]["id"] for key in preview["image_ids"])),
                        "video_ids": list(dict.fromkeys(videos[key]["id"] for key in preview.get("video_ids", [])))}
                for color, preview in entry["color_previews"].items()
            }
        entries.append(public)
    settings = store.settings()
    return {"version": 1, "entries": entries,
            "settings": {"name": settings["name"], "qq_image": public_asset(settings["qq_image"])}}


def replace_watched_snapshot(stage, output, previous):
    # Hugo's Windows watcher can hold the directory open. The media names are
    # content hashes, so both catalogs can coexist while the manifest switches.
    current_media, staged_media = output / "media", stage / "media"
    current_media.mkdir(exist_ok=True)
    old_names = {path.name for path in current_media.iterdir() if path.is_file()}
    new_names = {path.name for path in staged_media.iterdir()}
    previous.mkdir()
    catalog = output / "catalog.json"
    saved_catalog = previous / "catalog.json"
    shutil.copyfile(catalog, saved_catalog)
    with ExitStack() as rollback:
        for name in new_names - old_names:
            target = current_media / name
            (staged_media / name).rename(target)
            rollback.callback(target.unlink)
        (stage / "catalog.json").replace(catalog)
        rollback.callback(saved_catalog.replace, catalog)
        for name in old_names - new_names:
            saved = previous / name
            (current_media / name).rename(saved)
            rollback.callback(saved.rename, current_media / name)
        rollback.pop_all()


def export_public(data_dir, output):
    data_dir, output = Path(data_dir).resolve(), Path(output).resolve()
    if not (data_dir / "workshop.sqlite3").is_file():
        raise ValueError("Local workshop database does not exist; nothing exported")
    if output.is_relative_to(data_dir) or data_dir.is_relative_to(output):
        raise ValueError("Export and private data directories must be separate")
    if output.exists():
        verify_snapshot(output)  # Never replace an unrelated directory.
    store = Store(data_dir)
    output.parent.mkdir(parents=True, exist_ok=True)
    # Build and verify a separate folder before replacing the previous export.
    with tempfile.TemporaryDirectory(prefix=".workshop-export-", dir=output.parent) as temporary:
        stage, previous = Path(temporary) / "next", Path(temporary) / "previous"
        (stage / "media").mkdir(parents=True)
        payload = build_snapshot(store, stage / "media")
        (stage / "catalog.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        verify_snapshot(stage)
        if output.exists():
            try:
                output.rename(previous)
            except PermissionError as error:
                if getattr(error, "winerror", None) not in (5, 32):
                    raise
                replace_watched_snapshot(stage, output, previous)
                return payload
        try:
            stage.rename(output)
        except OSError:
            if previous.exists():
                previous.rename(output)
            raise
    return payload


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data-dir", type=Path, default=ROOT / ".local/print-workshop/data")
    parser.add_argument("--output", type=Path, default=ROOT / "static/workshop")
    parser.add_argument("--check", type=Path, help="Verify an existing export without reading private data")
    args = parser.parse_args()
    result = verify_snapshot(args.check) if args.check else export_public(args.data_dir, args.output)
    print(f'Public workshop verified: {len(result["entries"])} published entries; no private sources or database.')
