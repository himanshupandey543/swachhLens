"""Shared FastAPI dependencies (auth guards)."""
from __future__ import annotations

from fastapi import Depends, Header, HTTPException

from . import security
from .database import query_one


def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    """Decode the Bearer JWT and return the matching DB user, or 401."""
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = authorization.split(" ", 1)[1]
    try:
        payload = security.decode_token(token)
    except ValueError as exc:
        raise HTTPException(status_code=401, detail=str(exc)) from exc

    user = query_one("SELECT * FROM users WHERE id = ?", (payload["sub"],))
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists")
    return user


def require_employee(user: dict = Depends(get_current_user)) -> dict:
    """Require the authenticated account to be an EMPLOYEE (with a roster link)."""
    if user["role"] != "EMPLOYEE" or not user.get("employee_id"):
        raise HTTPException(status_code=403, detail="Employee access only")
    return user


def optional_current_user(authorization: str | None = Header(default=None)) -> dict | None:
    """Like get_current_user, but never raises — returns None when unauthenticated.

    Used by public endpoints (leaderboard, initiatives) so a stale/missing JWT
    never 401s a public page fetch; callers branch on the returned dict.
    """
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization.split(" ", 1)[1]
    try:
        payload = security.decode_token(token)
    except ValueError:
        return None
    user = query_one("SELECT * FROM users WHERE id = ?", (payload["sub"],))
    return user or None


def require_citizen(user: dict = Depends(get_current_user)) -> dict:
    """Require the authenticated account to be a USER (citizen)."""
    if user["role"] != "USER":
        raise HTTPException(status_code=403, detail="Citizen access only")
    return user
