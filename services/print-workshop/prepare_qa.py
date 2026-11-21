"""Prepare an isolated storefront snapshot for the browser regression scripts."""
from __future__ import annotations

import argparse
import subprocess
import tempfile
from pathlib import Path

from demo import seed
from export_public import export_public
from server import ROOT, Store


def prepare(output):
    with tempfile.TemporaryDirectory(prefix="workshop-qa-") as folder:
        workspace = Path(folder)
        store = Store(workspace / "data")
        seed(store)
        clip = workspace / "preview.webm"
        subprocess.run([
            "ffmpeg", "-hide_banner", "-loglevel", "error", "-f", "lavfi",
            "-i", "testsrc2=size=320x240:rate=24", "-t", "1", "-an",
            "-c:v", "libvpx-vp9", str(clip),
        ], check=True)
        video = store.save_asset(clip.name, clip.read_bytes())
        for entry in store.get_entries(admin=True):
            store.save_entry(dict(entry, video_ids=[video["id"]]), entry["id"])
        export_public(store.folder, output)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / ".local/print-workshop/qa-site/workshop")
    args = parser.parse_args()
    prepare(args.output)
    print(f"Workshop QA catalog: {args.output.resolve() / 'catalog.json'}")
