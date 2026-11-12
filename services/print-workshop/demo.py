"""Procedural demo assets, never represented as real printed goods."""
import json
import math
import struct


def vase_glb():
    positions, normals, indices = [], [], []
    radial, levels = 112, 56
    # A hollow, gently twisted vessel, including its inner wall and rim.
    def radius(t):
        return .056 + .034 * math.sin(math.pi * t) - .009 * t
    for inside in (False, True):
        for level in range(levels + 1):
            t = level / levels
            for side in range(radial + 1):
                angle = 2 * math.pi * side / radial
                wave = .0032 * math.cos(18 * (angle - t * .48))
                r = radius(t) + wave - (.004 if inside else 0)
                y = (.008 + .232 * t) if inside else .24 * t
                positions.extend([r * math.cos(angle), y - .12, r * math.sin(angle)])
                normals.extend([(-1 if inside else 1) * math.cos(angle), 0,
                                (-1 if inside else 1) * math.sin(angle)])
        offset = (levels + 1) * (radial + 1) if inside else 0
        for level in range(levels):
            for side in range(radial):
                a = offset + level * (radial + 1) + side
                b = a + radial + 1
                faces = [a, a + 1, b, a + 1, b + 1, b]
                if inside:
                    faces = [faces[i] for i in (2, 1, 0, 5, 4, 3)]
                indices.extend(faces)
    inner = (levels + 1) * (radial + 1)
    for side in range(radial):
        a = levels * (radial + 1) + side
        b = inner + a
        indices.extend([a, b, a + 1, a + 1, b, b + 1])
    pos = struct.pack(f"<{len(positions)}f", *positions)
    norm = struct.pack(f"<{len(normals)}f", *normals)
    ind = struct.pack(f"<{len(indices)}I", *indices)
    binary = pos + norm + ind
    metadata = {
        "asset": {"version": "2.0", "generator": "Yuzexiaoyu workshop procedural sample"},
        "scene": 0, "scenes": [{"nodes": [0]}], "nodes": [{"mesh": 0}],
        "meshes": [{"primitives": [{"attributes": {"POSITION": 0, "NORMAL": 1}, "indices": 2, "material": 0}]}],
        "materials": [{"name": "WorkshopBody", "doubleSided": True,
                       "pbrMetallicRoughness": {"baseColorFactor": [.47, .68, .59, 1], "metallicFactor": .05, "roughnessFactor": .42}}],
        "buffers": [{"byteLength": len(binary)}],
        "bufferViews": [{"buffer": 0, "byteOffset": 0, "byteLength": len(pos), "target": 34962},
                        {"buffer": 0, "byteOffset": len(pos), "byteLength": len(norm), "target": 34962},
                        {"buffer": 0, "byteOffset": len(pos) + len(norm), "byteLength": len(ind), "target": 34963}],
        "accessors": [{"bufferView": 0, "componentType": 5126, "count": len(positions) // 3, "type": "VEC3",
                       "min": [min(positions[i::3]) for i in range(3)], "max": [max(positions[i::3]) for i in range(3)]},
                      {"bufferView": 1, "componentType": 5126, "count": len(normals) // 3, "type": "VEC3"},
                      {"bufferView": 2, "componentType": 5125, "count": len(indices), "type": "SCALAR"}]
    }
    header = json.dumps(metadata, separators=(",", ":")).encode()
    header += b" " * (-len(header) % 4)
    binary += b"\0" * (-len(binary) % 4)
    length = 12 + 8 + len(header) + 8 + len(binary)
    return struct.pack("<4sII", b"glTF", 2, length) + struct.pack("<I4s", len(header), b"JSON") + header + struct.pack("<I4s", len(binary), b"BIN\0") + binary


def poster(warm=False):
    base, light = ("#9d704f", "#e8c8a4") if warm else ("#3d6e60", "#afdbc4")
    strokes = "".join(f'<path d="M{223+i*9} 143 C {150+i*14} 237 {225+i*5} 296 {244+i*6} 398"/>' for i in range(15))
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="800" height="650" viewBox="0 0 600 500">
    <defs><radialGradient id="bg"><stop stop-color="{'#41352d' if warm else '#253c37'}"/><stop offset="1" stop-color="#151c20"/></radialGradient>
    <linearGradient id="v"><stop stop-color="{base}"/><stop offset=".42" stop-color="{light}"/><stop offset="1" stop-color="{base}"/></linearGradient>
    <clipPath id="shape"><path d="M225 137 C225 200 168 214 190 292 L224 398 Q300 425 376 398 L410 292 C432 214 375 200 375 137Z"/></clipPath></defs>
    <rect width="600" height="500" fill="url(#bg)"/><ellipse cx="300" cy="427" rx="132" ry="19" fill="#000" opacity=".24"/>
    <path d="M225 137 C225 200 168 214 190 292 L224 398 Q300 425 376 398 L410 292 C432 214 375 200 375 137Z" fill="url(#v)"/>
    <g clip-path="url(#shape)" stroke="#152b23" opacity=".16" fill="none" stroke-width="3">{strokes}</g>
    <ellipse cx="300" cy="137" rx="75" ry="18" fill="{light}"/><ellipse cx="300" cy="137" rx="66" ry="12" fill="{base}"/>
    <text x="30" y="465" font-family="sans-serif" font-size="12" letter-spacing="4" fill="#82988e">FORM STUDY / DEMO</text></svg>'''.encode()


def seed(store):
    with store.connect() as db:
        seeded = db.execute("SELECT 1 FROM metadata WHERE key='demo_seeded'").fetchone()
    if seeded:
        return
    if store.get_entries(True):
        with store.connect() as db:
            db.execute("INSERT OR IGNORE INTO metadata VALUES ('demo_seeded','1')")
        return
    colors = [store.save_color({"name": name, "hex": color}) for name, color in
              [("鼠尾草绿", "#87B89E"), ("云雾白", "#E9E5DA"), ("石墨黑", "#454A50"),
               ("陶土橘", "#C28465"), ("雾霭蓝", "#8AABCD"), ("丁香紫", "#B5A0CC")]]
    model = store.save_asset("示例-扭纹花器.glb", vase_glb())
    for kind, name, warm in [("work", "形态练习 · 光与纹理", True), ("product", "扭纹花器", False)]:
        cover = store.save_asset(f"示例-{kind}.svg", poster(warm), trusted_demo=True)
        store.save_entry({"kind": kind, "name": name, "status": "published", "is_demo": True,
                          "description": "这是一件用于体验工坊的程序生成演示模型，并非实际售卖商品。\n" + ("可以试试旋转模型、切换颜色，或调整填充比例观察报价变化。" if kind == "product" else "可以旋转、缩放模型，或切换图片欣赏形态与纹理。") + "\n真实作品、价格和颜色请在管理后台添加或替换。",
                          "image_ids": [cover["id"]], "model_id": model["id"],
                          "color_ids": [c["id"] for c in colors] if kind == "product" else [],
                          "min_price": 20 if kind == "product" else 0, "max_price": 100 if kind == "product" else 0})
    with store.connect() as db:
        db.execute("INSERT OR IGNORE INTO metadata VALUES ('demo_seeded','1')")
