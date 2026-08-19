"""Pydantic request/response models."""
from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field


class RegisterRequest(BaseModel):
    email: str = Field(min_length=3, max_length=200)
    password: str = Field(min_length=6, max_length=200)
    name: str = Field(default="", max_length=200)
    role: Literal["USER", "EMPLOYEE"] = "USER"


class LoginRequest(BaseModel):
    email: str
    password: str


class ReportCreate(BaseModel):
    wasteType: str = Field(min_length=1, max_length=50)
    location: str = Field(min_length=1, max_length=300)
    lat: Optional[float] = None
    lng: Optional[float] = None
    desc: str = Field(default="", max_length=400)
    severity: Literal["Low", "Medium", "High"] = "Medium"
    photo: str = Field(default="", max_length=4_000_000)
    isBooking: bool = False
    scheduledAt: Optional[int] = None


class AssignRequest(BaseModel):
    groupId: Optional[str] = None
    memberId: Optional[str] = None


class VerifyRequest(BaseModel):
    action: Literal["pass", "reject"] = "pass"


class AnalyzeRequest(BaseModel):
    photo: str = Field(min_length=16, max_length=4_000_000)


class BinUpdate(BaseModel):
    fill: int = Field(ge=0, le=100)
