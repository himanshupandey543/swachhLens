"""Report lifecycle endpoints.

Status flow (server-authoritative, mirrors the frontend Store):
  PENDING → (lead approves) → IN_PROGRESS → (crew collects) → VERIFY
         → (lead passes) → RESOLVED   |  → (lead rejects) → IN_PROGRESS (rework)
"""
from __future__ import annotations

import json
import random
import string
import time

from fastapi import APIRouter, Depends, HTTPException, Response

from ..constants import group_of_employee, is_lead, roster_by_id, suggest
from ..database import execute, query, query_one, report_from_row
from ..dependencies import get_current_user, require_employee
from ..models import AssignRequest, ReportCreate, VerifyRequest

router = APIRouter(prefix="/reports", tags=["reports"])


def _new_id() -> str:
    return "WM-" + "".join(random.choices(string.ascii_uppercase + string.digits, k=5))


def _now() -> int:
    return int(time.time() * 1000)


def _group_load(group_id: str) -> int:
    row = query_one(
        "SELECT COUNT(*) AS n FROM reports WHERE assigned_group_id = ? AND status != 'RESOLVED'",
        (group_id,),
    )
    return row["n"] if row else 0


def _scoped_reports(user: dict) -> list[dict]:
    """Return the reports this user is allowed to see (role-scoped reads)."""
    if user["role"] == "USER":
        rows = query(
            "SELECT * FROM reports WHERE reporter = ? ORDER BY created_at DESC",
            (user["email"],),
        )
    else:
        emp_id = user.get("employee_id")
        gid = group_of_employee(emp_id) if emp_id else None
        if gid:
            rows = query(
                "SELECT * FROM reports"
                " WHERE suggested_group_id = ? OR assigned_group_id = ? OR assigned_to = ?"
                " ORDER BY created_at DESC",
                (gid, gid, emp_id),
            )
        else:
            rows = query("SELECT * FROM reports ORDER BY created_at DESC")
    return [report_from_row(r) for r in rows]


@router.get("")
def list_reports(user: dict = Depends(get_current_user)):
    return {"reports": _scoped_reports(user)}


@router.get("/stats")
def report_stats(user: dict = Depends(get_current_user)):
    reports = _scoped_reports(user)
    resolved = sum(1 for r in reports if r["status"] == "RESOLVED")
    total = len(reports)
    return {
        "total": total,
        "pending": sum(1 for r in reports if r["status"] == "PENDING"),
        "inProgress": sum(1 for r in reports if r["status"] == "IN_PROGRESS"),
        "verification": sum(1 for r in reports if r["status"] == "VERIFY"),
        "resolved": resolved,
        "active": total - resolved,
        "onTime": round(resolved / total * 100) if total else 100,
    }


@router.post("", status_code=201)
def create_report(body: ReportCreate, user: dict = Depends(get_current_user)):
    """Create a report. The AI dispatch matcher runs here (not on the client)."""
    now = _now()
    suggestion = suggest(body.location, body.wasteType, _group_load, lat=body.lat, lng=body.lng)
    rid = _new_id()
    history = json.dumps([{"at": now, "to": "PENDING", "by": user["name"] or "Citizen"}])

    execute(
        "INSERT INTO reports (id, waste_type, location, lat, lng, description, severity, photo,"
        " reporter, reporter_name, is_booking, scheduled_at, suggested_group_id,"
        " suggested_member_id, suggestion_reason, assigned_group_id, assigned_to,"
        " status, verified_by, created_at, resolved_at, history)"
        " VALUES (:id, :waste_type, :location, :lat, :lng, :description, :severity, :photo,"
        " :reporter, :reporter_name, :is_booking, :scheduled_at, :suggested_group_id,"
        " :suggested_member_id, :suggestion_reason, :assigned_group_id, :assigned_to,"
        " :status, :verified_by, :created_at, :resolved_at, :history)",
        {
            "id": rid,
            "waste_type": body.wasteType,
            "location": body.location,
            "lat": body.lat,
            "lng": body.lng,
            "description": body.desc,
            "severity": body.severity,
            "photo": body.photo,
            "reporter": user["email"],
            "reporter_name": user["name"],
            "is_booking": int(body.isBooking),
            "scheduled_at": body.scheduledAt,
            "suggested_group_id": suggestion["group"]["id"],
            "suggested_member_id": suggestion["member"]["id"],
            "suggestion_reason": suggestion["reason"],
            "assigned_group_id": None,
            "assigned_to": None,
            "status": "PENDING",
            "verified_by": None,
            "created_at": now,
            "resolved_at": None,
            "history": history,
        },
    )
    row = query_one("SELECT * FROM reports WHERE id = ?", (rid,))
    return {"report": report_from_row(row)}


@router.patch("/{report_id}/assign")
def assign_report(report_id: str, body: AssignRequest, user: dict = Depends(require_employee)):
    """Group lead approves (or overrides) the AI suggestion → IN_PROGRESS."""
    row = query_one("SELECT * FROM reports WHERE id = ?", (report_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "PENDING":
        raise HTTPException(status_code=409, detail="Only pending reports can be dispatched")

    group_id = body.groupId or row["suggested_group_id"]
    if not is_lead(user["employee_id"], group_id):
        raise HTTPException(status_code=403, detail="Only the group lead can approve a dispatch")

    member_id = body.memberId or row["suggested_member_id"]
    history = json.loads(row["history"] or "[]")
    history.append({"at": _now(), "to": "IN_PROGRESS", "by": "Dispatch"})

    execute(
        "UPDATE reports SET status = 'IN_PROGRESS', assigned_group_id = ?, assigned_to = ?, history = ? WHERE id = ?",
        (group_id, member_id, json.dumps(history), report_id),
    )
    return {"report": report_from_row(query_one("SELECT * FROM reports WHERE id = ?", (report_id,)))}


@router.patch("/{report_id}/collect")
def collect_report(report_id: str, user: dict = Depends(require_employee)):
    """Assigned crew member marks the pickup collected → VERIFY."""
    row = query_one("SELECT * FROM reports WHERE id = ?", (report_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "IN_PROGRESS":
        raise HTTPException(status_code=409, detail="Only in-progress reports can be marked collected")
    if row["assigned_to"] != user["employee_id"]:
        raise HTTPException(status_code=403, detail="Only the assigned crew member can mark this collected")

    member = roster_by_id(user["employee_id"])
    history = json.loads(row["history"] or "[]")
    history.append({"at": _now(), "to": "VERIFY", "by": member["name"] if member else "Crew"})

    execute(
        "UPDATE reports SET status = 'VERIFY', history = ? WHERE id = ?",
        (json.dumps(history), report_id),
    )
    return {"report": report_from_row(query_one("SELECT * FROM reports WHERE id = ?", (report_id,)))}


@router.patch("/{report_id}/verify")
def verify_report(report_id: str, body: VerifyRequest, user: dict = Depends(require_employee)):
    """Group lead accepts (→ RESOLVED) or sends back for rework (→ IN_PROGRESS)."""
    row = query_one("SELECT * FROM reports WHERE id = ?", (report_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["status"] != "VERIFY":
        raise HTTPException(status_code=409, detail="Only reports in verification can be signed off")
    if not is_lead(user["employee_id"], row["assigned_group_id"]):
        raise HTTPException(status_code=403, detail="Only the group lead can verify this report")

    now = _now()
    history = json.loads(row["history"] or "[]")
    if body.action == "pass":
        status, resolved_at, verified_by = "RESOLVED", now, user["name"]
        history.append({"at": now, "to": "RESOLVED", "by": "✓ " + user["name"]})
    else:
        status, resolved_at, verified_by = "IN_PROGRESS", row["resolved_at"], row["verified_by"]
        history.append({"at": now, "to": "IN_PROGRESS", "by": "↩️ " + user["name"] + " — rework"})

    execute(
        "UPDATE reports SET status = ?, resolved_at = ?, verified_by = ?, history = ? WHERE id = ?",
        (status, resolved_at, verified_by, json.dumps(history), report_id),
    )
    return {"report": report_from_row(query_one("SELECT * FROM reports WHERE id = ?", (report_id,)))}


@router.patch("/{report_id}/cancel")
def cancel_report(report_id: str, user: dict = Depends(get_current_user)):
    """Citizen cancels their own report (soft-cancel → CANCELLED, kept in history)."""
    row = query_one("SELECT * FROM reports WHERE id = ?", (report_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    if row["reporter"] != user["email"]:
        raise HTTPException(status_code=403, detail="Only the reporter can cancel this report")
    if row["status"] not in ("PENDING", "IN_PROGRESS"):
        raise HTTPException(status_code=409, detail="This report can no longer be cancelled")

    history = json.loads(row["history"] or "[]")
    history.append({"at": _now(), "to": "CANCELLED", "by": user["name"] or "Citizen"})
    execute(
        "UPDATE reports SET status = 'CANCELLED', history = ? WHERE id = ?",
        (json.dumps(history), report_id),
    )
    return {"report": report_from_row(query_one("SELECT * FROM reports WHERE id = ?", (report_id,)))}


@router.delete("/{report_id}", status_code=204)
def delete_report(report_id: str, user: dict = Depends(get_current_user)):
    row = query_one("SELECT * FROM reports WHERE id = ?", (report_id,))
    if not row:
        raise HTTPException(status_code=404, detail="Report not found")
    is_owner = row["reporter"] == user["email"]
    emp_id = user.get("employee_id")
    is_group_lead = bool(
        emp_id
        and (is_lead(emp_id, row["assigned_group_id"]) or is_lead(emp_id, row["suggested_group_id"]))
    )
    if not (is_owner or is_group_lead):
        raise HTTPException(status_code=403, detail="You don't have permission to delete this report")
    execute("DELETE FROM reports WHERE id = ?", (report_id,))
    return Response(status_code=204)
