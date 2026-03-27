"""
NEXUS — FastAPI Main
Email Listener + LangGraph Agent + BRD Pipeline + Calendar + WebSocket
"""
import asyncio, json, os, uuid, tempfile
from email.utils import parseaddr
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

from services.google_auth    import get_auth_url, exchange_code, save_credentials, load_credentials
from services.gmail_service  import fetch_unread_emails, send_email, mark_read, fetch_thread_emails, get_owner_email, GmailRateLimitError
from services.calendar_service import get_upcoming_events, delete_event
from services.docx_generator import generate_docx
from agents.graph            import run_agent


# ── In-memory state ────────────────────────────────────────
store = {
    "actions":      [],      # pending + completed agent actions
    "processed":    set(),   # de-duped email IDs
    "meetings":     [],      # confirmed calendar events
    "brd_jobs":     {},      # job_id → brd result
    "authenticated":False,
    "owner_email":  "",
    "ws_clients":   [],
    "summaries":    [],
    "latest_emails": [],
}
MAX_EMAIL_FETCH = int(os.getenv("MAX_EMAIL_FETCH", "30"))
AUTO_SEND_REPLIES = os.getenv("AUTO_SEND_REPLIES", "true").lower() in ("1", "true", "yes", "on")

BUSINESS_DOMAIN_ALLOWLIST = {
    d.strip().lower()
    for d in os.getenv("BUSINESS_DOMAIN_ALLOWLIST", "").split(",")
    if d.strip()
}
NON_BUSINESS_KEYWORDS = {
    "newsletter", "promotion", "discount", "sale", "unsubscribe", "otp", "verification code",
    "security alert", "linkedin", "instagram", "facebook", "twitter", "no-reply", "noreply"
}
BUSINESS_KEYWORDS = {
    "project", "client", "requirement", "brd", "business", "proposal", "invoice", "contract",
    "meeting", "schedule", "timeline", "deliverable", "sow", "kickoff", "milestone"
}


# ── WebSocket broadcast ────────────────────────────────────
async def broadcast(data: dict):
    dead = []
    for ws in store["ws_clients"]:
        try:    await ws.send_json(data)
        except: dead.append(ws)
    for ws in dead:
        if ws in store["ws_clients"]:
            store["ws_clients"].remove(ws)

async def run_blocking(fn, *args, **kwargs):
    """
    Run sync IO in threadpool, but gracefully fall back when reload-mode
    shuts down the default executor.
    """
    try:
        return await asyncio.to_thread(fn, *args, **kwargs)
    except RuntimeError as e:
        if "Executor shutdown has been called" in str(e):
            return fn(*args, **kwargs)
        raise


def should_process_business_email(email: dict) -> tuple[bool, str]:
    sender = (email.get("sender", "") or "").lower()
    sender_email = (email.get("sender_email") or parseaddr(sender)[1] or "").lower()
    subject = (email.get("subject", "") or "").lower()
    body = (email.get("body", "") or "").lower()
    text = f"{subject}\n{body[:4000]}"

    domain = sender_email.split("@")[-1] if "@" in sender_email else ""
    if domain and domain in BUSINESS_DOMAIN_ALLOWLIST:
        return True, f"allowlist:{domain}"

    if any(k in sender or k in text for k in NON_BUSINESS_KEYWORDS):
        return False, "non_business_keyword"

    if any(k in text for k in BUSINESS_KEYWORDS):
        return True, "business_keyword"

    # Conservative default: skip if not clearly business.
    return False, "not_clearly_business"


# ── Email poll loop ────────────────────────────────────────
async def email_poll_loop():
    print("[NEXUS] Email polling started (every 30s)")
    while True:
        sleep_seconds = 30
        try:
            creds = load_credentials()
            if creds:
                emails = await run_blocking(
                    fetch_unread_emails, creds, MAX_EMAIL_FETCH
                )
                for email in emails:
                    if email["id"] in store["processed"]:
                        continue
                    ok, reason = should_process_business_email(email)
                    if not ok:
                        store["processed"].add(email["id"])
                        await broadcast({"type":"log","level":"info",
                            "msg":f"Skipped email ({reason}): {email.get('subject','(no subject)')}"})
                        continue
                    store["processed"].add(email["id"])
                    asyncio.create_task(process_email(email))
        except GmailRateLimitError as e:
            sleep_seconds = min(max(e.retry_after_seconds, 30), 900)
            print(f"[NEXUS] Gmail rate-limited. Backing off for {sleep_seconds}s")
            await broadcast({"type":"log","level":"error",
                "msg":f"Gmail API rate limit hit. Retrying in {sleep_seconds}s."})
        except Exception as e:
            print(f"[NEXUS] Poll error: {e}")
        await asyncio.sleep(sleep_seconds)


async def process_email(email: dict):
    """Run LangGraph agent on one real email, then broadcast result."""
    await broadcast({"type":"log","level":"info",
        "msg":f"Processing: {email.get('subject', '(no subject)')} from {email.get('sender', 'unknown')}"})

    try:
        creds = load_credentials()
        thread_emails = []
        if creds and email.get("thread_id"):
            try:
                thread_emails = await run_blocking(
                    fetch_thread_emails, creds, email["thread_id"]
                )
            except Exception as thread_err:
                await broadcast({"type":"log","level":"error",
                    "msg":f"Thread fetch failed for {email.get('id','?')}: {thread_err}"})

        # Run full LangGraph pipeline
        result = await run_agent(email, thread_emails)
    except Exception as e:
        # Keep pipeline alive even when LLM/API fails.
        fallback_subject = email.get("subject", "(no subject)")
        result = {
            "intent": "general",
            "urgency_score": 40,
            "sentiment": "neutral",
            "needs_human": False,
            "draft_subject": f"Re: {fallback_subject}",
            "draft_body": (
                "Thanks for your email. We received your request and are reviewing it. "
                "A detailed response will follow shortly."
            ),
            "calendar_event": None,
            "brd_final": None,
            "summary": "Fallback flow used because agent pipeline failed.",
        }
        await broadcast({"type":"log","level":"error",
            "msg":f"Agent failed for {email.get('id','?')}: {e}"})

    intent  = result.get("intent","general")
    urgency = result.get("urgency_score", 0)
    is_business_email = bool(result.get("is_business_email", True))
    business_category = result.get("business_category", "other")
    urgency_reason = result.get("urgency_reason", "")

    urgency = max(0, min(int(urgency or 0), 100))

    if not is_business_email:
        await broadcast({"type":"log","level":"info",
            "msg":f"Skipped non-business email: {email.get('subject','(no subject)')}"})
        return

    action = {
        "id":          email["id"],
        "thread_id":   email["thread_id"],
        "email":       email,
        "intent":      intent,
        "urgency":     urgency,
        "sentiment":   result.get("sentiment","neutral"),
        "status":      "escalated" if result.get("needs_human") else "pending",
        "section":     "escalation" if result.get("needs_human") else intent,
        "summary":     result.get("summary",""),
        "business_category": business_category,
        "urgency_reason": urgency_reason,
        "draft_subject": result.get("draft_subject",""),
        "draft_body":    result.get("draft_body",""),
        "calendar_event":result.get("calendar_event"),
        "brd_final":     result.get("brd_final"),
        "brd_docx_path": None,
        "brd_job_id":    None,
        "created_at":    datetime.utcnow().isoformat(),
    }

    # If BRD was generated — save and generate DOCX
    if result.get("brd_final"):
        job_id     = str(uuid.uuid4())[:8]
        docx_path  = os.path.join(tempfile.gettempdir(), f"brd_{job_id}.docx")
        await run_blocking(generate_docx, result["brd_final"], docx_path)
        action["brd_docx_path"] = docx_path
        action["brd_job_id"]  = job_id
        store["brd_jobs"][job_id] = {
            "result":    result["brd_final"],
            "docx_path": docx_path,
            "email_id":  email["id"],
        }
        await broadcast({"type":"brd_ready","job_id":job_id,
            "title": result["brd_final"].get("title","BRD")})

    # If calendar event was created — save it
    if result.get("calendar_event"):
        store["meetings"].insert(0, result["calendar_event"])
        await broadcast({"type":"meeting_created",
                         "meeting": result["calendar_event"]})

    store["actions"].insert(0, action)
    store["summaries"].insert(0, {
        "email_id": email.get("id"),
        "subject": email.get("subject", ""),
        "intent": intent,
        "urgency": urgency,
        "status": action["status"],
        "summary": action.get("summary", ""),
        "created_at": action["created_at"],
    })
    store["summaries"] = store["summaries"][:500]
    msg_type = "escalation" if action["status"]=="escalated" else "new_action"
    await broadcast({"type": msg_type, "payload": action})
    await broadcast({"type":"log","level":"ok" if action["status"]!="escalated" else "error",
        "msg":f"Intent: {intent.upper()} | urgency={urgency} | status={action['status']}"})

    if AUTO_SEND_REPLIES and action["status"] == "pending":
        try:
            send_result = await _send_action_email(action, {})
            if send_result.get("status") == "sent":
                await broadcast({"type":"log","level":"ok",
                    "msg":f"Auto-sent reply for {email.get('subject','(no subject)')}"})
        except Exception as auto_send_err:
            await broadcast({"type":"log","level":"error",
                "msg":f"Auto-send failed for {email.get('id','?')}: {auto_send_err}"})


async def _send_action_email(action: dict, body: dict):
    creds = load_credentials()
    if not creds:
        return {"error":"Not authenticated"}

    final_body    = body.get("body") if body else None
    final_subject = body.get("subject") if body else None
    final_body    = final_body or action.get("draft_body","")
    final_subject = final_subject or action.get("draft_subject","")
    email         = action.get("email", {})
    recipient     = email.get("sender_email") or parseaddr(email.get("sender", ""))[1]
    if not recipient:
        return {"error":"Cannot determine recipient email address"}

    await run_blocking(
        send_email, creds,
        to=[recipient],
        subject=final_subject,
        body=final_body,
        thread_id=email.get("thread_id"),
        message_id=email.get("message_id"),
        attachment_path=action.get("brd_docx_path"),
    )

    await run_blocking(mark_read, creds, action.get("id"))
    action["status"]      = "sent"
    action["executed_at"] = datetime.utcnow().isoformat()
    await broadcast({"type":"action_update","id":action.get("id"),"status":"sent"})
    return {"status":"sent"}


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(email_poll_loop())
    yield


app = FastAPI(title="NEXUS", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

@app.get("/", response_class=FileResponse)
async def root():
    return "index.html"


# ══════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════
@app.get("/auth/login")
async def auth_login():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(get_auth_url())

@app.get("/auth/callback")
async def auth_callback(code: str, state: str | None = None):
    try:
        creds = exchange_code(code, state=state)
        save_credentials(creds)
        store["authenticated"] = True
        store["owner_email"]   = get_owner_email(creds)
        await broadcast({"type":"auth","status":"ok","email":store["owner_email"]})
        return HTMLResponse("""<html><body style="background:#07080d;color:#dde0ef;
        font-family:sans-serif;display:flex;align-items:center;justify-content:center;
        height:100vh;margin:0;text-align:center">
        <div><div style="font-size:48px">✓</div><h2>Connected to Google!</h2>
        <p style="color:#8890a8">NEXUS now has real Gmail + Calendar access.</p>
        <p style="color:#8890a8">You can close this tab.</p></div></body></html>""")
    except Exception as e:
        return HTMLResponse(f"""<html><body style="background:#07080d;color:#dde0ef;
        font-family:sans-serif;display:flex;align-items:center;justify-content:center;
        height:100vh;margin:0;text-align:center">
        <div><h2>Google auth failed</h2>
        <p style="color:#ff8f8f">Error: {str(e)}</p>
        <p style="color:#8890a8">Check redirect URI in Google Cloud and try /auth/login again.</p>
        </div></body></html>""", status_code=400)

@app.get("/auth/status")
async def auth_status():
    creds = load_credentials()
    return {"authenticated": creds is not None,
            "email": store.get("owner_email","")}


# ══════════════════════════════════════════════════════════════
# EMAILS
# ══════════════════════════════════════════════════════════════
@app.get("/api/emails")
async def list_emails(limit: int = MAX_EMAIL_FETCH):
    creds = load_credentials()
    if not creds: return {"emails":[],"error":"Not authenticated"}
    limit = max(1, min(limit, MAX_EMAIL_FETCH))
    try:
        emails = await run_blocking(fetch_unread_emails, creds, limit)
        store["latest_emails"] = emails
        return {"emails": emails}
    except Exception as e:
        await broadcast({"type":"log","level":"error","msg":f"Inbox fetch failed: {e}"})
        return {"emails": [], "error": f"Inbox fetch failed: {e}"}

@app.post("/api/emails/process/{email_id}")
async def manual_process(email_id: str):
    """Manually trigger agent on a specific email ID."""
    creds = load_credentials()
    if not creds: return {"error":"Not authenticated"}
    email = next((e for e in store.get("latest_emails", []) if e.get("id")==email_id), None)
    if not email:
        return {"error":"Email not loaded in current inbox view. Click Fetch first, then process."}
    ok, reason = should_process_business_email(email)
    if not ok:
        return {"error":f"Email blocked by business filter ({reason})."}
    asyncio.create_task(process_email(email))
    return {"status":"processing","email_id":email_id}


# ══════════════════════════════════════════════════════════════
# ACTIONS (agent queue)
# ══════════════════════════════════════════════════════════════
@app.get("/api/actions")
async def list_actions(status: str = None):
    actions = store["actions"]
    if status: actions = [a for a in actions if a["status"]==status]
    return {"actions": actions}

@app.get("/api/actions/sections")
async def list_actions_by_sections():
    """
    Return actions grouped by section for dashboard buckets.
    Sections include dynamic intent buckets plus escalation.
    """
    grouped = {}
    for action in store["actions"]:
        section = action.get("section") or (
            "escalation" if action.get("status") == "escalated" else action.get("intent", "general")
        )
        grouped.setdefault(section, []).append(action)

    return {
        "sections": grouped,
        "counts": {section: len(items) for section, items in grouped.items()},
        "total": len(store["actions"]),
    }

@app.post("/api/actions/{action_id}/approve")
async def approve_action(action_id: str, body: dict = {}):
    action = next((a for a in store["actions"] if a["id"]==action_id), None)
    if not action: return {"error":"Not found"}
    result = await _send_action_email(action, body or {})
    if result.get("error"):
        return result
    email = action.get("email", {})
    await broadcast({"type":"log","level":"ok",
        "msg":f"Real email sent to {email['sender']}"})
    return {"status":"sent"}

@app.post("/api/actions/{action_id}/reject")
async def reject_action(action_id: str):
    a = next((a for a in store["actions"] if a["id"]==action_id), None)
    if a: a["status"] = "rejected"
    await broadcast({"type":"action_update","id":action_id,"status":"rejected"})
    return {"status":"rejected"}

@app.put("/api/actions/{action_id}/draft")
async def edit_draft(action_id: str, body: dict):
    """Human edits the draft — re-runs reply composer with edits."""
    a = next((a for a in store["actions"] if a["id"]==action_id), None)
    if not a: return {"error":"Not found"}
    a["draft_body"]    = body.get("body",    a.get("draft_body",""))
    a["draft_subject"] = body.get("subject", a.get("draft_subject",""))
    return {"status":"updated","action":a}

@app.get("/api/stats")
async def get_stats():
    creds = load_credentials()
    return {
        "processed":     len(store["processed"]),
        "meetings":      len(store["meetings"]),
        "escalations":   len([a for a in store["actions"] if a["status"]=="escalated"]),
        "pending":       len([a for a in store["actions"] if a["status"]=="pending"]),
        "brds_generated":len(store["brd_jobs"]),
        "authenticated": creds is not None,
        "owner_email":   store.get("owner_email",""),
        "auto_send":     AUTO_SEND_REPLIES,
    }

@app.get("/api/summary")
async def get_summary():
    return {
        "overview": {
            "processed": len(store["processed"]),
            "actions": len(store["actions"]),
            "escalations": len([a for a in store["actions"] if a["status"]=="escalated"]),
            "brds_generated": len(store["brd_jobs"]),
            "meetings": len(store["meetings"]),
            "auto_send_enabled": AUTO_SEND_REPLIES,
        },
        "recent": store["summaries"][:100],
    }


# ══════════════════════════════════════════════════════════════
# CALENDAR
# ══════════════════════════════════════════════════════════════
@app.get("/api/calendar/events")
async def calendar_events(days: int = 14):
    creds = load_credentials()
    if not creds: return {"events":[]}
    events = await run_blocking(get_upcoming_events, creds, days)
    return {"events": events}

@app.delete("/api/calendar/events/{event_id}")
async def cancel_event(event_id: str):
    creds = load_credentials()
    await run_blocking(delete_event, creds, event_id)
    store["meetings"] = [m for m in store["meetings"] if m.get("id")!=event_id]
    return {"status":"cancelled"}


# ══════════════════════════════════════════════════════════════
# BRD
# ══════════════════════════════════════════════════════════════
@app.post("/api/brd/from-upload")
async def brd_from_upload(file: UploadFile = File(...)):
    """Directly upload a transcript/email file to generate BRD."""
    content = (await file.read()).decode("utf-8", errors="ignore")
    name    = (file.filename or "").lower()
    stype   = ("transcript" if any(x in name for x in ["transcript","meeting","call"])
                else "email" if "email" in name else "document")

    fake_email = {
        "id":        str(uuid.uuid4())[:8],
        "thread_id": str(uuid.uuid4())[:8],
        "sender":    "upload@nexus.ai",
        "subject":   f"BRD Request: {file.filename}",
        "body":      f"Please generate a BRD from this {stype}:\n\n{content[:500]}",
        "attachments": [{"name": file.filename, "content": content, "type": stype}],
        "force_intent": "brd",
    }
    asyncio.create_task(process_email(fake_email))
    return {"status":"processing","email_id":fake_email["id"]}

@app.get("/api/brd/{job_id}/result")
async def get_brd(job_id: str):
    job = store["brd_jobs"].get(job_id)
    if not job: return {"error":"Not found"}
    return job["result"]

@app.get("/api/brd/{job_id}/download")
async def download_brd(job_id: str):
    job = store["brd_jobs"].get(job_id)
    if not job or "docx_path" not in job: return {"error":"DOCX not ready"}
    return FileResponse(
        job["docx_path"],
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        filename=f"BRD_{job_id}.docx"
    )

@app.get("/api/brd/list")
async def list_brds():
    return {"brds":[
        {"job_id":jid, "title":j["result"].get("title","BRD"),
         "email_id":j.get("email_id")}
        for jid,j in store["brd_jobs"].items()
    ]}


# ══════════════════════════════════════════════════════════════
# WEBSOCKET
# ══════════════════════════════════════════════════════════════
@app.websocket("/ws/live")
async def websocket(ws: WebSocket):
    await ws.accept()
    store["ws_clients"].append(ws)
    creds = load_credentials()
    await ws.send_json({
        "type": "init",
        "authenticated": creds is not None,
        "owner_email":   store.get("owner_email",""),
        "actions":       store["actions"][:10],
        "meetings":      store["meetings"][:5],
        "stats": {
            "processed":   len(store["processed"]),
            "meetings":    len(store["meetings"]),
            "escalations": len([a for a in store["actions"] if a["status"]=="escalated"]),
            "pending":     len([a for a in store["actions"] if a["status"]=="pending"]),
            "brds":        len(store["brd_jobs"]),
        }
    })
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        if ws in store["ws_clients"]:
            store["ws_clients"].remove(ws)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
