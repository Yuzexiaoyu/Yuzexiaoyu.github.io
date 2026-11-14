"""Export only published customer content; the local database is never deployed."""
from __future__ import annotations

import argparse
import hashlib
import json
import re
import shutil
import tempfile
from pathlib import Path

from server import ROOT, Store

ENTRY_FIELDS = {"id", "revision", "name", "description", "kind", "status", "min_price", "max_price", "is_demo", "updated_at"}
ASSET_NAME = re.compile(r"[0-9a-f]{64}\.(?:png|jpg|jpeg|webp|svg|mp4|webm|mov|glb)")


def verify_snapshot(folder):
    folder = Path(folder).resolve()
    payload = json.loads((folder / "catalog.json").read_text(encoding="utf-8"))
    if set(payload) != {"version", "entries", "settings"} or payload["version"] != 1:
        raise ValueError("Unsupported public catalog")
    expected = {"catalog.json"}

    def check_asset(asset):
        if asset is None:
            return
        if set(asset) != {"id", "name", "url", "kind", "size"} or asset["kind"] not in ("image", "video", "model"):
            raise ValueError("Unexpected asset fields or private source")
        filename = asset["url"].removeprefix("/workshop/media/")
        if not asset["url"].startswith("/workshop/media/") or not ASSET_NAME.fullmatch(filename):
            raise ValueError("Invalid public asset path")
        target = folder / "media" / filename
        if target.is_symlink() or target.resolve().parent != folder / "media":
            raise ValueError("Public asset must remain inside the export")
        data = target.read_bytes()
        if hashlib.sha256(data).hexdigest() != asset["id"] or len(data) != asset["size"]:
            raise ValueError("Public asset integrity mismatch")
        expected.add("media/" + filename)

    for entry in payload["entries"]:
        if set(entry) - (ENTRY_FIELDS | {"images", "videos", "model", "colors"}) or entry["status"] != "published":
            raise ValueError("Private or unpublished entry in public catalog")
        for asset in entry["images"] + entry.get("videos", []):
            check_asset(asset)
        check_asset(entry["model"])
    if set(payload["settings"]) != {"name", "qq_image"}:
        raise ValueError("Unexpected public settings")
    check_asset(payload["settings"]["qq_image"])
    actual = {path.relative_to(folder).as_posix() for path in folder.rglob("*") if path.is_file() or path.is_symlink()}
    if actual != expected:
        raise ValueError("Unexpected or missing files in public export")
    return payload


def export_public(data_dir, output):
    data_dir, output = Path(data_dir).resolve(), Path(output).resolve()
    if not (data_dir / "workshop.sqlite3").is_file():
        raise ValueError("Local workshop database does not exist; nothing exported")
    if output.is_relative_to(data_dir) or data_dir.is_relative_to(output):
        raise ValueError("Export and private data directories must be separate")
    if output.exists():
        verify_snapshot(output)  # Never replace an unrelated directory.
    store = Store(data_dir)
    assets = {}

    def public_asset(asset):
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
        assets[filename] = source
        names = {"image": "预览图片", "video": "预览视频", "model": "3D 预览"}
        return {"id": asset["id"], "name": names[asset["kind"]],
                "url": "/workshop/media/" + filename, "kind": asset["kind"], "size": asset["size"]}

    entries = []
    for entry in store.get_entries():
        public = {key: entry[key] for key in sorted(ENTRY_FIELDS) if key in entry}
        public.update(images=[public_asset(asset) for asset in entry["images"]],
                      videos=[public_asset(asset) for asset in entry.get("videos", [])],
                      model=public_asset(entry["model"]), colors=entry["colors"])
        entries.append(public)
    settings = store.settings()
    payload = {"version": 1, "entries": entries,
               "settings": {"name": settings["name"], "qq_image": public_asset(settings["qq_image"])}}
    output.parent.mkdir(parents=True, exist_ok=True)
    # Build and verify a separate folder before replacing the previous export.
    with tempfile.TemporaryDirectory(prefix=".workshop-export-", dir=output.parent) as temporary:
        stage, previous = Path(temporary) / "next", Path(temporary) / "previous"
        (stage / "media").mkdir(parents=True)
        for filename, source in assets.items():
            shutil.copyfile(source, stage / "media" / filename)
        (stage / "catalog.json").write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        verify_snapshot(stage)
        if output.exists():
            output.rename(previous)
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
