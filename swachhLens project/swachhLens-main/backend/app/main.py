"""SwachLens FastAPI application.

Serves the REST API under /api/... and the static frontend (index.html,
css/, js/) from the same origin so the whole app runs from one URL.

The catch-all static route is registered LAST so it never shadows the API
routes or FastAPI's automatic /docs and /openapi.json endpoints.
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse

from . import config
from .database import init_db
from .routes import analyze, auth, community, constants, gis, reports

app = FastAPI(title="SwachLens API", version="1.0.0")

# Dev-friendly CORS: we authenticate with Bearer tokens (not cookies), so a
# permissive allowlist is safe. Tighten for production.
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.FRONTEND_ORIGINS + ["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# API routes (must come before the static catch-all).
app.include_router(auth.router, prefix="/api")
app.include_router(reports.router, prefix="/api")
app.include_router(constants.router, prefix="/api")
app.include_router(analyze.router, prefix="/api")
app.include_router(gis.router, prefix="/api")
app.include_router(community.router, prefix="/api")


@app.on_event("startup")
def _on_startup() -> None:
    init_db()


def _resolve_static(full_path: str) -> Path:
    root = config.STATIC_DIR.resolve()
    candidate = (root / full_path).resolve()
    if candidate != root and root not in candidate.parents:
        raise HTTPException(status_code=403, detail="Forbidden")
    if candidate.is_dir():
        candidate = candidate / "index.html"
    if candidate.is_file():
        return candidate
    # Extensionless routes → serve the matching .html (e.g. /login → login.html).
    if not Path(full_path).suffix:
        html = root / (full_path + ".html")
        if html.is_file():
            return html
    raise HTTPException(status_code=404, detail="Not found")


@app.get("/{full_path:path}", include_in_schema=False)
def serve_static(full_path: str):
    # No-cache keeps the browser from serving stale HTML/CSS/JS during development
    # (this project has no build step, so files change in place).
    return FileResponse(
        _resolve_static(full_path),
        headers={"Cache-Control": "no-cache, max-age=0"},
    )
