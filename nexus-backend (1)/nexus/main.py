"""
NEXUS — FastAPI Main
Email Listener + LangGraph Agent + BRD Pipeline + Calendar + WebSocket
"""
import asyncio, json, os, uuid
from contextlib import asynccontextmanager
from datetime import datetime
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse

from services.google_auth    import get_auth_url, exchange_code, save_credentials, load_credentials
from services.gmail_service  import fetch_unread_emails, send_email, mark_read, fetch_thread_emails, get_owner_email
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


# ── Email poll loop ────────────────────────────────────────
async def email_poll_loop():
    print("[NEXUS] Email polling started (every 30s)")
    while True:
        try:
            creds = load_credentials()
            if creds:
                emails = await asyncio.to_thread(
                    fetch_unread_emails, creds, 20
                )
                for email in emails:
                    if email["id"] in store["processed"]:
                        continue
                    store["processed"].add(email["id"])
                    asyncio.create_task(process_email(email))
        except Exception as e:
            print(f"[NEXUS] Poll error: {e}")
        await asyncio.sleep(30)


async def process_email(email: dict):
    """Run LangGraph agent on one real email, then broadcast result."""
    await broadcast({"type":"log","level":"info",
        "msg":f"Processing: {email['subject']} from {email['sender']}"})

    creds = load_credentials()
    thread_emails = []
    if creds and email.get("thread_id"):
        try:
            thread_emails = await asyncio.to_thread(
                fetch_thread_emails, creds, email["thread_id"]
            )
        except Exception: pass

    # Run full LangGraph pipeline
    result = await run_agent(email, thread_emails)

    intent  = result.get("intent","general")
    urgency = result.get("urgency_score", 0)

    action = {
        "id":          email["id"],
        "thread_id":   email["thread_id"],
        "email":       email,
        "intent":      intent,
        "urgency":     urgency,
        "sentiment":   result.get("sentiment","neutral"),
        "status":      "escalated" if result.get("needs_human") else "pending",
        "draft_subject": result.get("draft_subject",""),
        "draft_body":    result.get("draft_body",""),
        "calendar_event":result.get("calendar_event"),
        "brd_final":     result.get("brd_final"),
        "brd_job_id":    None,
        "created_at":    datetime.utcnow().isoformat(),
    }

    # If BRD was generated — save and generate DOCX
    if result.get("brd_final"):
        job_id     = str(uuid.uuid4())[:8]
        docx_path  = f"/tmp/brd_{job_id}.docx"
        await asyncio.to_thread(generate_docx, result["brd_final"], docx_path)
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
    msg_type = "escalation" if action["status"]=="escalated" else "new_action"
    await broadcast({"type": msg_type, "payload": action})
    await broadcast({"type":"log","level":"ok" if action["status"]!="escalated" else "error",
        "msg":f"Intent: {intent.upper()} | urgency={urgency} | status={action['status']}"})


@asynccontextmanager
async def lifespan(app: FastAPI):
    asyncio.create_task(email_poll_loop())
    yield


app = FastAPI(title="NEXUS", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"],
    allow_credentials=True, allow_methods=["*"], allow_headers=["*"])


# ══════════════════════════════════════════════════════════════
# AUTH
# ══════════════════════════════════════════════════════════════
@app.get("/auth/login")
async def auth_login():
    from fastapi.responses import RedirectResponse
    return RedirectResponse(get_auth_url())

@app.get("/auth/callback")
async def auth_callback(code: str):
    creds = exchange_code(code)
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

@app.get("/auth/status")
async def auth_status():
    creds = load_credentials()
    return {"authenticated": creds is not None,
            "email": store.get("owner_email","")}


# ══════════════════════════════════════════════════════════════
# EMAILS
# ══════════════════════════════════════════════════════════════
@app.get("/api/emails")
async def list_emails(limit: int = 20):
    creds = load_credentials()
    if not creds: return {"emails":[],"error":"Not authenticated"}
    emails = await asyncio.to_thread(fetch_unread_emails, creds, limit)
    return {"emails": emails}

@app.post("/api/emails/process/{email_id}")
async def manual_process(email_id: str):
    """Manually trigger agent on a specific email ID."""
    creds = load_credentials()
    if not creds: return {"error":"Not authenticated"}
    emails = await asyncio.to_thread(fetch_unread_emails, creds, 50)
    email  = next((e for e in emails if e["id"]==email_id), None)
    if not email: return {"error":"Email not found"}
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

@app.post("/api/actions/{action_id}/approve")
async def approve_action(action_id: str, body: dict = {}):
    action = next((a for a in store["actions"] if a["id"]==action_id), None)
    if not action: return {"error":"Not found"}

    creds = load_credentials()
    if not creds: return {"error":"Not authenticated"}

    # Use human-edited draft if provided
    final_body    = body.get("body")    or action.get("draft_body","")
    final_subject = body.get("subject") or action.get("draft_subject","")
    email         = action["email"]

    # Send the REAL email
    await asyncio.to_thread(
        send_email, creds,
        to=[email["sender"]],
        subject=final_subject,
        body=final_body,
        thread_id=email.get("thread_id"),
        message_id=email.get("message_id"),
        attachment_path=action.get("brd_docx_path"),
    )

    # Mark original as read
    await asyncio.to_thread(mark_read, creds, action_id)

    action["status"]      = "sent"
    action["executed_at"] = datetime.utcnow().isoformat()
    await broadcast({"type":"action_update","id":action_id,"status":"sent"})
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
    }


# ══════════════════════════════════════════════════════════════
# CALENDAR
# ══════════════════════════════════════════════════════════════
@app.get("/api/calendar/events")
async def calendar_events(days: int = 14):
    creds = load_credentials()
    if not creds: return {"events":[]}
    events = await asyncio.to_thread(get_upcoming_events, creds, days)
    return {"events": events}

@app.delete("/api/calendar/events/{event_id}")
async def cancel_event(event_id: str):
    creds = load_credentials()
    await asyncio.to_thread(delete_event, creds, event_id)
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
