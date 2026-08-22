"""Runtime configuration loaded from environment variables (.env)."""
import os
from pathlib import Path

# Ensure JWT_SECRET has a fallback default value
JWT_SECRET = os.getenv("JWT_SECRET", "default_swachlens_secret_key_change_in_prod")

# backend/  (the folder holding app/, run.py, requirements.txt)
BASE_DIR = Path(__file__).resolve().parent.parent

# The frontend project root (index.html, css/, js/) — one folder above backend/.
STATIC_DIR = BASE_DIR.parent

DATA_DIR = BASE_DIR / "data"
DATA_DIR.mkdir(exist_ok=True)

# Database: PostgreSQL in production (via DATABASE_URL), SQLite locally
DATABASE_URL = os.getenv("DATABASE_URL")
if DATABASE_URL:
    # Railway/Heroku provide postgres:// but psycopg2 needs postgresql://
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)
else:
    # Local SQLite fallback
    DATABASE_PATH = Path(
        os.getenv("DATABASE_PATH", "swachlens.db").replace("./", "")
    )
    if not DATABASE_PATH.is_absolute():
        DATABASE_PATH = DATA_DIR / DATABASE_PATH
    DATABASE_URL = f"sqlite:///{DATABASE_PATH}"

# JWT authentication
SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET", "dev-secret-change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "168"))

# JWT authentication
SECRET_KEY = os.getenv("SECRET_KEY") or os.getenv("JWT_SECRET", "dev-secret-change-me-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRES_HOURS = int(os.getenv("JWT_EXPIRES_HOURS", "168"))

# Path to a trained YOLO waste-detection model (optional). The /api/analyze
# endpoint only uses it when (a) the file exists AND (b) ultralytics is
# importable; otherwise it falls back to a deterministic stdlib classifier.
# Default points at the repo's ai/models/best.pt (matches ai/src/predict.py).
AI_MODEL_PATH = Path(
    os.getenv("AI_MODEL_PATH", "").replace("./", "") or (BASE_DIR.parent.parent / "ai" / "models" / "best.pt")
)
AI_MAX_PHOTO_BYTES = int(os.getenv("AI_MAX_PHOTO_BYTES", "2621440"))  # 2.5 MB decoded

# CORS: Allow frontend from different origins (Netlify, Vercel, etc.)
FRONTEND_ORIGINS = os.getenv(
    "FRONTEND_ORIGINS",
    "http://localhost:8090,http://127.0.0.1:8090,http://localhost:8000,http://127.0.0.1:8000",
).split(",")
