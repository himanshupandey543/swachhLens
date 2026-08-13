"""Photo analysis endpoint. POST /api/analyze — authenticated, stateless."""
from __future__ import annotations

import base64

from fastapi import APIRouter, Depends, HTTPException

from ..analyzer import analyze_image
from ..config import AI_MAX_PHOTO_BYTES
from ..dependencies import get_current_user
from ..models import AnalyzeRequest

router = APIRouter(prefix="/analyze", tags=["analyze"])

# JPEG (FF D8 FF) and PNG (89 50 4E 47) magic bytes — a cheap, dependency-free
# sanity check so we don't hash arbitrary garbage as a "photo".
_JPEG = bytes([0xFF, 0xD8, 0xFF])
_PNG = bytes([0x89, 0x50, 0x4E, 0x47])


def _decode_photo(photo: str) -> bytes:
    # Accept an optional data-URL prefix ("data:image/jpeg;base64," ...).
    payload = photo.split(",", 1)[1] if photo.startswith("data:") else photo
    try:
        raw = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Photo is not valid base64.") from exc
    if not raw:
        raise HTTPException(status_code=400, detail="Photo is empty.")
    if len(raw) > AI_MAX_PHOTO_BYTES:
        raise HTTPException(
            status_code=413,
            detail=f"Photo is too large (max {AI_MAX_PHOTO_BYTES // 1_048_576} MB).",
        )
    # Reject clearly-not-an-image payloads without needing PIL.
    if not (raw.startswith(_JPEG) or raw.startswith(_PNG)):
        raise HTTPException(status_code=422, detail="Photo must be a JPEG or PNG image.")
    return raw


@router.post("")
def analyze(body: AnalyzeRequest, user: dict = Depends(get_current_user)):
    image_bytes = _decode_photo(body.photo)
    # Never leak the caller's identity into the result; the analyzer returns the
    # full { valid, reason, wasteType, severity, confidence, engine, details, summary }.
    return analyze_image(image_bytes)