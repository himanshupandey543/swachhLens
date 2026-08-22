"""Static lookup data endpoint (kept in code, not the DB)."""
from __future__ import annotations

from fastapi import APIRouter

from ..constants import (
    EMPLOYEE_ACCOUNTS,
    GROUPS,
    ROSTER,
    STATUS,
    STATUS_LABEL,
    WASTE_TYPES,
)

router = APIRouter(prefix="/constants", tags=["constants"])


@router.get("")
def get_constants():
    return {
        "status": STATUS,
        "statusLabels": STATUS_LABEL,
        "wasteTypes": WASTE_TYPES,
        "groups": GROUPS,
        "roster": ROSTER,
        "employeeAccounts": EMPLOYEE_ACCOUNTS,
    }
