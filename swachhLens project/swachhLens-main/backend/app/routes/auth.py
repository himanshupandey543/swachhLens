"""Authentication endpoints: register, login, logout, me."""
from __future__ import annotations

import re
import time

from fastapi import APIRouter, Depends, HTTPException

from .. import security
from ..constants import employee_id_for_email
from ..database import execute, query_one
from ..dependencies import get_current_user
from ..models import LoginRequest, RegisterRequest

router = APIRouter(prefix="/auth", tags=["auth"])

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _user_public(user: dict) -> dict:
    return {
        "id": user["id"],
        "email": user["email"],
        "name": user["name"],
        "role": user["role"],
        "employee_id": user.get("employee_id"),
    }


@router.post("/register", status_code=201)
def register(body: RegisterRequest):
    email = body.email.strip().lower()
    if not EMAIL_RE.match(email):
        raise HTTPException(status_code=422, detail="Please enter a valid email address.")
    if query_one("SELECT id FROM users WHERE email = ?", (email,)):
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    name = body.name.strip() or email.split("@")[0]
    employee_id = employee_id_for_email(email) if body.role == "EMPLOYEE" else None
    user = {
        "id": "usr_" + security.sha256_short(email),
        "email": email,
        "password_hash": security.hash_password(body.password),
        "name": name,
        "role": body.role,
        "employee_id": employee_id,
        "created_at": int(time.time() * 1000),
    }
    execute(
        "INSERT INTO users (id, email, password_hash, name, role, employee_id, created_at)"
        " VALUES (:id, :email, :password_hash, :name, :role, :employee_id, :created_at)",
        {
            "id": user["id"],
            "email": user["email"],
            "password_hash": user["password_hash"],
            "name": user["name"],
            "role": user["role"],
            "employee_id": user["employee_id"],
            "created_at": user["created_at"],
        },
    )
    return {"user": _user_public(user), "token": security.create_token(user)}


@router.post("/login")
def login(body: LoginRequest):
    email = body.email.strip().lower()
    user = query_one("SELECT * FROM users WHERE email = ?", (email,))
    if not user or not security.verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    return {"user": _user_public(user), "token": security.create_token(user)}


@router.post("/logout")
def logout(_user: dict = Depends(get_current_user)):
    # JWTs are stateless; the client just discards the token. A token blacklist
    # can be added later if revocation is needed.
    return {"ok": True}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    return _user_public(user)
