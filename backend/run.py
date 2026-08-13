"""SwachLens backend launcher.

Run from the backend/ directory:

    pip install -r requirements.txt
    python run.py

The FastAPI server listens on http://127.0.0.1:8000 and serves BOTH the
REST API (/api/...) and the static frontend (index.html, css/, js/) so the
whole app runs from one URL. The Node static server (node server.js) is
still supported as an alternative — the frontend talks to the API over CORS.
"""
import os

import uvicorn
from dotenv import load_dotenv


if __name__ == "__main__":
    load_dotenv()
    host = os.getenv("HOST", "127.0.0.1")
    port = int(os.getenv("PORT", "8000"))
    reload = os.getenv("RELOAD", "1") == "1"
    uvicorn.run("app.main:app", host=host, port=port, reload=reload)
