"""Static lookup data shared with the frontend (kept in code, not the DB).

These mirror js/state.js. The server uses them for the AI dispatch matcher
and for role/lead checks; the frontend keeps its own copy so dashboards can
render instantly without a round trip.
"""
from __future__ import annotations

STATUS = {
    "PENDING": "PENDING",
    "IN_PROGRESS": "IN_PROGRESS",
    "VERIFY": "VERIFY",
    "RESOLVED": "RESOLVED",
}
STATUS_LABEL = {
    "PENDING": "Pending",
    "IN_PROGRESS": "In Progress",
    "VERIFY": "Verification",
    "RESOLVED": "Resolved",
}

WASTE_TYPES = [
    {"key": "Plastic", "icon": "🧴", "desc": "Bottles, bags & packaging"},
    {"key": "Organic", "icon": "🥗", "desc": "Food scraps & garden waste"},
    {"key": "E-Waste", "icon": "🔌", "desc": "Electronics & batteries"},
    {"key": "Hazardous", "icon": "☣️", "desc": "Chemicals, paint & medical waste"},
]

# Area groups — each has a lead (the group's lead employee).
GROUPS = [
    {"id": "grp_north", "name": "North Zone", "zone": "north", "icon": "🏞️", "leadId": "emp_sarah"},
    {"id": "grp_east", "name": "East Zone", "zone": "east", "icon": "🏙️", "leadId": "emp_john"},
    {"id": "grp_west", "name": "West Zone", "zone": "west", "icon": "🌉", "leadId": "emp_ahmed"},
]

# Crew roster — every member belongs to an area group.
ROSTER = [
    {"id": "emp_john", "name": "John Driver", "specialty": "Driver", "icon": "🚛", "color": "#16a34a", "groupId": "grp_east"},
    {"id": "emp_sarah", "name": "Sarah Collector", "specialty": "Collector", "icon": "🧺", "color": "#8b5cf6", "groupId": "grp_north"},
    {"id": "emp_ravi", "name": "Ravi Kumar", "specialty": "E-waste", "icon": "🔌", "color": "#f59e0b", "groupId": "grp_north"},
    {"id": "emp_mei", "name": "Mei Chen", "specialty": "Hazmat", "icon": "☣️", "color": "#ef4444", "groupId": "grp_east"},
    {"id": "emp_ahmed", "name": "Ahmed Ali", "specialty": "Compost", "icon": "🌱", "color": "#0ea5e9", "groupId": "grp_west"},
]

# Employee login emails → roster id (used for demo + new employee accounts).
EMPLOYEE_ACCOUNTS = {
    "employee@test.com": "emp_john",
    "john.driver@test.com": "emp_john",
    "sarah.collector@test.com": "emp_sarah",
    "ravi.kumar@test.com": "emp_ravi",
    "mei.chen@test.com": "emp_mei",
    "ahmed.ali@test.com": "emp_ahmed",
}

# Waste type → crew specialty best suited to handle it.
SPECIALTY_FOR = {"E-Waste": "E-waste", "Hazardous": "Hazmat", "Organic": "Compost", "Compost": "Compost"}

# TACO annotation ids (the AI model's class index) → the app's waste types.
# The TACO dataset has 60 leaf categories across 10 supercategories; this maps
# them to SwachLens' 4 waste types. Anything not explicitly mapped falls back
# to a generic dry-recyclable bucket (DEFAULT_WASTE_TYPE).
CLASS_ID_TO_TYPE = {
    # --- Plastic ---
    0: "Plastic", 1: "Plastic", 2: "Plastic", 3: "Plastic", 4: "Plastic",
    5: "Plastic", 6: "Plastic", 7: "Plastic", 8: "Plastic", 9: "Plastic",
    50: "Plastic", 51: "Plastic", 52: "Plastic", 53: "Plastic", 54: "Plastic",
    55: "Plastic", 56: "Plastic", 57: "Plastic", 58: "Plastic", 59: "Plastic",
    # --- E-Waste (batteries, electronics) ---
    10: "E-Waste", 11: "E-Waste", 12: "E-Waste", 13: "E-Waste",
    21: "E-Waste", 22: "E-Waste",
    # --- Hazardous (paint, oil, sharp objects, medical) ---
    23: "Hazardous", 24: "Hazardous", 46: "Hazardous", 47: "Hazardous", 48: "Hazardous",
    # --- Organic (food / organic matter / leaves) ---
    61: "Organic", 62: "Organic",
}
DEFAULT_WASTE_TYPE = "Plastic"  # generic dry recyclables that have no clean bucket


def roster_by_id(employee_id: str) -> dict | None:
    return next((e for e in ROSTER if e["id"] == employee_id), None)


def group_by_id(group_id: str) -> dict | None:
    return next((g for g in GROUPS if g["id"] == group_id), None)


def group_of_employee(employee_id: str) -> str | None:
    member = roster_by_id(employee_id)
    return member["groupId"] if member else None


def is_lead(employee_id: str, group_id: str) -> bool:
    group = group_by_id(group_id)
    return bool(group and group["leadId"] == employee_id)


def employee_id_for_email(email: str) -> str:
    """Map a login email to a roster member (fallback = first crew member)."""
    return EMPLOYEE_ACCOUNTS.get((email or "").lower(), ROSTER[0]["id"])


# Nominal ward centre used to map a report's exact lat/lng to an area zone.
_WARD_LAT, _WARD_LNG = 28.625, 77.210


def _zone_by_coords(lat: float, lng: float) -> str:
    """Split the ward into quadrants: north / east / west around its centre."""
    if lat > _WARD_LAT:
        return "north"
    if lng >= _WARD_LNG:
        return "east"
    return "west"


def suggest(location: str, waste_type: str, group_load, lat: float | None = None,
            lng: float | None = None) -> dict:
    """Deterministic 'AI' dispatch matcher (mirrors js/state.js Store.suggest).

    Picks the area group + crew member best suited to a report:
      1. the zone containing the report's exact lat/lng (when provided)
      2. otherwise the group hinted by the location's zone keyword ("north"/"east"/"west")
      3. otherwise the group holding the matching crew specialty
      4. otherwise the least-loaded group (group_load(id) returns active count)
    """
    loc = (location or "").lower()
    need = SPECIALTY_FOR.get(waste_type)

    group = None
    coord_zone = None
    if lat is not None and lng is not None:
        coord_zone = _zone_by_coords(float(lat), float(lng))
        group = next((g for g in GROUPS if g["zone"] == coord_zone), None)

    if group is None:
        zone_hint = next((g["zone"] for g in GROUPS if loc.find(g["zone"]) != -1), None)
        by_zone = next((g for g in GROUPS if g["zone"] == zone_hint), None) if zone_hint else None

        spec_group = None
        if need:
            spec_group = next(
                (g for g in GROUPS if any(e["groupId"] == g["id"] and e["specialty"] == need for e in ROSTER)),
                None,
            )

        group = by_zone or spec_group
        if not group:
            group = min(GROUPS, key=lambda g: group_load(g["id"]))

    members = [e for e in ROSTER if e["groupId"] == group["id"]]
    member = next((e for e in members if need and e["specialty"] == need), None)
    if not member:
        member = next((e for e in ROSTER if e["id"] == group["leadId"]), None)
    if not member and members:
        member = members[0]
    if not member:
        member = ROSTER[0]

    reasons = []
    if coord_zone and group.get("zone") == coord_zone:
        reasons.append(f"📍 {group['name']} covers your pinned location")
    elif group.get("zone"):
        reasons.append(f"📍 {group['name']} covers that area")
    if need:
        reasons.append(f"🔧 best match for {waste_type} waste")
    if not reasons:
        reasons.append("⚖️ least-loaded zone")

    return {"group": group, "member": member, "reason": " · ".join(reasons)}
