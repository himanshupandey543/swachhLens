"""Password hashing + JWT signing using only the Python standard library.

- Password hashing: scrypt (salted, memory-hard KDF).
- Tokens: HS256 JWTs (header.payload.signature) via hmac + sha256.

Using the stdlib avoids the passlib/bcrypt version incompatibilities and
keeps the dependency list to just FastAPI + uvicorn.
"""
from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time

from . import config

# scrypt parameters — OWASP recommendation for interactive login (n=2^14, r=8, p=1).
SCRYPT_N = 2 ** 14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 64
SCRYPT_MAXMEM = 2 ** 27  # 128 MiB


def sha256_short(value: str) -> str:
    """Deterministic short hash used to derive user ids from emails."""
    return hashlib.sha256((value or "").encode()).hexdigest()[:16]


# ---------------------------------------------------------------------------
# Passwords (scrypt)
# ---------------------------------------------------------------------------
def hash_password(password: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.scrypt(
        password.encode(), salt=salt, n=SCRYPT_N, r=SCRYPT_R, p=SCRYPT_P,
        dklen=SCRYPT_DKLEN, maxmem=SCRYPT_MAXMEM,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${dk.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        algo, n, r, p, salt_hex, dk_hex = stored.split("$")
        if algo != "scrypt":
            return False
        dk = hashlib.scrypt(
            password.encode(), salt=bytes.fromhex(salt_hex), n=int(n), r=int(r), p=int(p),
            dklen=SCRYPT_DKLEN, maxmem=SCRYPT_MAXMEM,
        )
        return hmac.compare_digest(dk.hex(), dk_hex)
    except Exception:
        return False


# ---------------------------------------------------------------------------
# JWTs (HS256)
# ---------------------------------------------------------------------------
def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode()


def _b64url_decode(text: str) -> bytes:
    padding = "=" * (-len(text) % 4)
    return base64.urlsafe_b64decode(text + padding)


def create_token(user: dict) -> str:
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "employee_id": user.get("employee_id"),
        "iat": now,
        "exp": now + config.JWT_EXPIRES_HOURS * 3600,
    }
    seg = (
        _b64url(json.dumps(header, separators=(",", ":")).encode())
        + "."
        + _b64url(json.dumps(payload, separators=(",", ":")).encode())
    )
    sig = hmac.new(config.JWT_SECRET.encode(), seg.encode(), hashlib.sha256).digest()
    return seg + "." + _b64url(sig)


def decode_token(token: str) -> dict:
    """Return the JWT payload or raise ValueError for any invalid token."""
    try:
        head, body, sig = token.split(".")
        expected = hmac.new(
            config.JWT_SECRET.encode(), f"{head}.{body}".encode(), hashlib.sha256
        ).digest()
        if not hmac.compare_digest(_b64url_decode(sig), expected):
            raise ValueError("Bad signature")
        payload = json.loads(_b64url_decode(body))
        if int(payload.get("exp", 0)) < int(time.time()):
            raise ValueError("Token has expired")
        return payload
    except ValueError:
        raise
    except Exception as exc:  # malformed base64 / json
        raise ValueError(f"Invalid token: {exc}") from exc
