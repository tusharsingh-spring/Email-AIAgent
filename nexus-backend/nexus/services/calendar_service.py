"""
Google Calendar Service — REAL freebusy lookup + REAL event creation.
10-minute buffer enforced. Working hours respected. Weekends skipped.
"""
import os
from datetime import datetime, timedelta, timezone
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

BUFFER   = int(os.getenv("BUFFER_MINUTES",   "10"))
WH_START = int(os.getenv("WORK_START_HOUR",  "9"))
WH_END   = int(os.getenv("WORK_END_HOUR",    "18"))
DAYS     = int(os.getenv("SEARCH_DAYS",      "7"))


def _svc(creds): return build("calendar","v3",credentials=creds,cache_discovery=False)


def get_upcoming_events(creds: Credentials, days: int = 14) -> list[dict]:
    now    = datetime.now(timezone.utc).isoformat()
    future = (datetime.now(timezone.utc)+timedelta(days=days)).isoformat()
    r = _svc(creds).events().list(
        calendarId="primary", timeMin=now, timeMax=future,
        singleEvents=True, orderBy="startTime", maxResults=50
    ).execute()
    return [{
        "id":       e.get("id"),
        "title":    e.get("summary","(no title)"),
        "start":    e.get("start",{}).get("dateTime") or e.get("start",{}).get("date"),
        "end":      e.get("end",{}).get("dateTime")   or e.get("end",{}).get("date"),
        "attendees":[a["email"] for a in e.get("attendees",[])],
        "status":   e.get("status","confirmed"),
        "html_link":e.get("htmlLink",""),
    } for e in r.get("items",[])]


def find_free_slot(
    creds:          Credentials,
    attendees:      list[str],
    duration_minutes: int = 30,
    preferred_start:  datetime = None,
) -> datetime | None:
    """Find first real slot where ALL attendees + owner are free."""
    now      = datetime.now(timezone.utc)
    end_date = now + timedelta(days=DAYS)

    # Real freebusy API call
    fb = _svc(creds).freebusy().query(body={
        "timeMin":  now.isoformat(),
        "timeMax":  end_date.isoformat(),
        "timeZone": "UTC",
        "items":    [{"id": e} for e in (attendees or [])] + [{"id": "primary"}],
    }).execute()

    busy = []
    for cal in fb.get("calendars", {}).values():
        for interval in cal.get("busy", []):
            s = datetime.fromisoformat(interval["start"].replace("Z","+00:00"))
            e = datetime.fromisoformat(interval["end"].replace("Z","+00:00"))
            busy.append((s - timedelta(minutes=BUFFER),
                         e + timedelta(minutes=BUFFER)))
    busy.sort(key=lambda x: x[0])

    slot_len  = timedelta(minutes=duration_minutes + BUFFER * 2)
    candidate = preferred_start or now

    # Snap to next working hour
    candidate = candidate.replace(second=0, microsecond=0)
    if candidate.hour < WH_START:
        candidate = candidate.replace(hour=WH_START, minute=0)
    elif candidate.hour >= WH_END:
        candidate = (candidate + timedelta(days=1)).replace(hour=WH_START, minute=0)

    for _ in range(DAYS * 24 * 2):
        if candidate.weekday() >= 5:
            candidate = (candidate + timedelta(days=1)).replace(hour=WH_START, minute=0)
            continue
        if candidate.hour < WH_START or candidate.hour >= WH_END:
            if candidate.hour >= WH_END:
                candidate = (candidate + timedelta(days=1)).replace(hour=WH_START, minute=0)
            else:
                candidate = candidate.replace(hour=WH_START, minute=0)
            continue

        slot_end = candidate + slot_len
        if not any(not (slot_end <= bs or candidate >= be) for bs, be in busy):
            return candidate + timedelta(minutes=BUFFER)  # actual meeting start

        candidate += timedelta(minutes=30)

    return None


def create_event(
    creds:            Credentials,
    title:            str,
    start:            datetime,
    duration_minutes: int,
    attendees:        list[str],
    description:      str = "",
) -> dict:
    """Create REAL Google Calendar event. Sends invite emails to all attendees."""
    end = start + timedelta(minutes=duration_minutes)
    evt = {
        "summary":     title,
        "description": (description + "\n\n[Scheduled by NEXUS — Experimental AI Assistant]").strip(),
        "start":  {"dateTime": start.isoformat(), "timeZone": "UTC"},
        "end":    {"dateTime": end.isoformat(),   "timeZone": "UTC"},
        "attendees": [{"email": e} for e in attendees],
        "reminders": {"useDefault": False, "overrides": [
            {"method": "email",  "minutes": 60},
            {"method": "popup",  "minutes": 10},
        ]},
    }
    created = _svc(creds).events().insert(
        calendarId="primary", body=evt,
        sendUpdates="all", conferenceDataVersion=0
    ).execute()
    print(f"[Calendar] Event created: {title} @ {start} → {created.get('htmlLink')}")
    return created


def delete_event(creds: Credentials, event_id: str):
    _svc(creds).events().delete(
        calendarId="primary", eventId=event_id, sendUpdates="all"
    ).execute()
