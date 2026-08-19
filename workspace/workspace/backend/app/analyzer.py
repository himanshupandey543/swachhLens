"""Waste-photo classifier for POST /api/analyze.

Contract: every photo analysis returns a single object describing whether the
photo is a usable dump image and, when valid, the details of the waste:

    {
      "valid": bool,            # True = a photo of waste (or a plausible photo, when estimating)
      "reason": str | None,     # why invalid ("blank", "too small", "no waste detected", ...)
      "wasteType": str | None,  # Plastic | Organic | E-Waste | Hazardous
      "severity": str | None,   # Low | Medium | High
      "confidence": int | None, # 0-100
      "engine": "yolo"|"demo",  # real model vs deterministic estimate
      "details": [ { "label", "count", "conf" }, ... ],
      "summary": str | None       # one human-readable sentence
    }

Guarantees (stdlib only — no torch/ultralytics/pillow needed to boot):

- A **validity gate** runs first and rejects corrupt/empty, non-PNG/JPEG,
  too-small, and (for PNG) blank/solid-color images with ``valid:false`` +
  ``reason``.
- **YOLO machine** is used ONLY when a trained model exists at
  ``config.AI_MODEL_PATH`` AND ultralytics is importable. It reports
  ``valid:false "no waste detected"`` when no objects are found, and item-level
  ``details`` otherwise. Never ``save=True`` (predict writes annotated files).
- **Fallback ("demo")** produces a clearly-labelled *estimate* for photos that
  pass the gate but can't be truly recognised without a model.
"""
from __future__ import annotations

import hashlib
import math
import zlib

from . import config
from .constants import CLASS_ID_TO_TYPE, DEFAULT_WASTE_TYPE, WASTE_TYPES

_TYPE_KEYS = [w["key"] for w in WASTE_TYPES]      # order matters for the fallback

# Per-type substance detail used by the fallback estimate + YOLO summaries.
_SUBSTANCE = {
    "Plastic": "bottles, bags & packaging",
    "Organic": "food scraps & garden waste",
    "E-Waste": "electronics & batteries",
    "Hazardous": "chemicals, paint & medical waste",
}
_SEVERITY_WORDS = {"Low": "small", "Medium": "medium", "High": "overflow-level"}

_MIN_DIM = 64                     # below this it's an icon/thumbnail, not a dump
_BLANK_ENTROPY = 3.25             # bits/byte; below this the decompressed image looks uniform

_model = None
_model_path_checked = False


def _load_model():
    """Cached ultralytics YOLO model, or None when unavailable.

    Importing ultralytics is heavy, so it's gated on the model file existing.
    Any failure (ImportError, missing file, load error) returns None and the
    caller falls back.
    """
    global _model, _model_path_checked
    if _model is not None:
        return _model
    if _model_path_checked:
        return None
    _model_path_checked = True
    try:
        path = config.AI_MODEL_PATH
        if not path or not path.is_file():
            return None
        from ultralytics import YOLO  # heavy — imported only when needed

        _model = YOLO(str(path))
        return _model
    except Exception:
        return None


# ---------------------------------------------------------------------------
# Size / content gate (pure stdlib)
# ---------------------------------------------------------------------------
def _png_wh(data: bytes):
    """PNG width/height from the IHDR chunk, else None."""
    if len(data) < 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        return None
    try:
        return int.from_bytes(data[16:20], "big"), int.from_bytes(data[20:24], "big")
    except Exception:
        return None


def _jpeg_wh(data: bytes):
    """JPEG width/height from the SOFn marker (minimal segment walker)."""
    if data[:2] != b"\xff\xd8":
        return None
    i, n = 2, len(data)
    while i < n - 1:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8,) or 0xD0 <= marker <= 0xD7 or marker == 0xFF:
            i += 2
            continue
        if i + 4 > n:
            break
        seg_len = int.from_bytes(data[i + 2:i + 4], "big")
        if seg_len < 2 or i + 2 + seg_len > n:
            break
        if 0xC0 <= marker <= 0xCF and marker not in (0xC4, 0xC8, 0xCC):
            # SOF payload: [len][precision][height][width]
            return int.from_bytes(data[i + 7:i + 9], "big"), int.from_bytes(data[i + 5:i + 7], "big")
        i += 2 + seg_len
    return None


def _shannon_entropy(stream: bytes) -> float:
    if not stream:
        return 0.0
    counts = [0] * 256
    for b in stream:
        counts[b] += 1
    n = len(stream)
    ent = 0.0
    for c in counts:
        if c:
            p = c / n
            ent -= p * math.log2(p)
    return ent


def _png_blank(data: bytes) -> bool:
    """True when a PNG decompresses to a near-uniform (blank) image."""
    try:
        idat = []
        i = 8
        while i + 12 <= len(data):
            length = int.from_bytes(data[i:i + 4], "big")
            ctype = data[i + 4:i + 8]
            if ctype == b"IDAT":
                end = min(i + 8 + length, len(data))
                idat.append(data[i + 8:end])
            i += 12 + length
            if ctype == b"IEND":
                break
        if not idat:
            return True
        raw = zlib.decompress(b"".join(idat))
    except Exception:
        return False  # can't decompress → let it through rather than misfire
    if len(raw) < 64:
        return True
    return _shannon_entropy(raw[:65536]) < _BLANK_ENTROPY


def _validate_image(data: bytes) -> str | None:
    """Return a rejection reason, or None when the image passes the gate."""
    is_png = data[:8] == b"\x89PNG\r\n\x1a\n"
    is_jpeg = data[:2] == b"\xff\xd8"
    if not (is_png or is_jpeg):
        return "Image type not recognised (PNG / JPEG only)."
    if is_png:
        wh = _png_wh(data)
        if not wh or wh[0] < _MIN_DIM or wh[1] < _MIN_DIM:
            return "Image is too small to be a dump photo."
        if _png_blank(data):
            return "Photo appears blank or empty — no waste visible."
    else:
        wh = _jpeg_wh(data)
        if not wh or wh[0] < _MIN_DIM or wh[1] < _MIN_DIM:
            return "Image is too small to be a dump photo."
    return None


# ---------------------------------------------------------------------------
# Classification
# ---------------------------------------------------------------------------
def _severity_from_detections(dets: list, frame_area: int) -> str:
    if not dets:
        return "Medium"
    confs = [d.get("conf", 0) or 0 for d in dets]
    top_conf = max(confs)
    max_area = 0
    for d in dets:
        box = d.get("box") or []
        if len(box) == 4:
            max_area = max(max_area, box[2] * box[3])
    if len(dets) >= 3 or (frame_area and max_area / max(frame_area, 1) >= 0.40) or top_conf >= 0.85:
        return "High"
    if len(dets) == 1 and max_area and max_area / max(max_area, 1) < 0.05 and top_conf < 0.5:
        return "Low"
    return "Medium"


def _invalid(reason: str, engine: str = "demo") -> dict:
    return {"valid": False, "reason": reason, "wasteType": None, "severity": None,
            "confidence": None, "engine": engine, "details": [], "summary": None}


def _classify_yolo(image_bytes: bytes) -> dict:
    model = _load_model()
    if model is None:
        return _invalid("AI model unavailable.", engine="demo")
    results = model.predict(source=image_bytes, conf=0.25, verbose=False, save=False)
    dets = []
    for r in results:
        boxes = getattr(r, "boxes", None)
        if boxes is None or boxes.cls is None:
            continue
        names = getattr(r, "names", {}) or {}
        for cls_id, conf in zip(boxes.cls.tolist(), boxes.conf.tolist()):
            cid = int(cls_id)
            dets.append({"classId": cid, "cls": names.get(cid, str(cid)),
                         "conf": round(float(conf), 3),
                         "box": [float(v) for v in boxes.xywh[cid].tolist()]})
    if not dets:
        return _invalid("No waste detected in the photo.", engine="yolo")

    by_label: dict[str, list] = {}
    counts: dict[str, int] = {}
    for d in dets:
        by_label.setdefault(d["cls"], []).append(d)
        bucket = CLASS_ID_TO_TYPE.get(d["classId"], DEFAULT_WASTE_TYPE)
        counts[bucket] = counts.get(bucket, 0) + 1

    top_type = max(counts, key=lambda k: (counts[k], -_TYPE_KEYS.index(k) if k in _TYPE_KEYS else 0))
    details = [
        {"label": lbl, "count": len(items),
         "conf": int(round(max(x["conf"] for x in items) * 100))}
        for lbl, items in by_label.items()
    ]
    confidence = int(round(max(d["conf"] for d in dets) * 100))
    severity = _severity_from_detections(dets, frame_area=0)
    total = sum(d["count"] for d in details)
    subst = _SUBSTANCE.get(top_type, "")
    summary = (f"{total} {top_type.lower()} {'item' if total == 1 else 'items'} detected — "
               f"{_SEVERITY_WORDS.get(severity, severity)} pile. {subst}")
    return {"valid": True, "reason": None, "wasteType": top_type, "severity": severity,
            "confidence": confidence, "engine": "yolo", "details": details, "summary": summary}


def _classify_fallback(image_bytes: bytes) -> dict:
    """Deterministic estimate (clearly labelled) for photos that pass the gate."""
    digest = hashlib.sha256(image_bytes).digest()
    seed = int.from_bytes(digest[:4], "big")
    wtype = _TYPE_KEYS[seed % len(_TYPE_KEYS)]
    if seed % 4 == 0:
        sev = "High"
    elif seed % 5 == 0:
        sev = "Low"
    else:
        sev = "Medium"
    conf = 60 + (seed % 25)  # 60..84 — visibly below a "model" confidence
    subst = _SUBSTANCE.get(wtype, "")
    details = [{"label": subst, "count": 1, "conf": conf}]
    summary = f"Estimated {wtype.lower()} waste — {_SEVERITY_WORDS.get(sev, sev)} pile. {subst}"
    return {"valid": True, "reason": None, "wasteType": wtype, "severity": sev,
            "confidence": conf, "engine": "demo", "details": details, "summary": summary}


def analyze_image(image_bytes: bytes) -> dict:
    """Classify a photo: reject invalid inputs, then prefer YOLO when ready."""
    gate = _validate_image(image_bytes)
    if gate is not None:
        return _invalid(gate)
    if _load_model() is not None:
        try:
            result = _classify_yolo(image_bytes)
            if result["engine"] == "yolo":
                return result
        except Exception:
            pass  # inference failed → fall back to the estimate
    return _classify_fallback(image_bytes)