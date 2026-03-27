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
from services.clustering_service import ProjectClusteringAgent
from services.parsers import MultiModalParsers
from agents.graph            import run_agent
import services.db_service as db_service

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# 1. Create the app instance FIRST
app = FastAPI(title="NEXUS Backend")

# 2. Then add middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],            # For development – restrict later
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 3. Then your routes, WebSocket, etc.

# ── In-memory state ────────────────────────────────────────
store = {
    "actions":      [],      # agent actions (linked to projects in DB)
    "processed":    set(),   # cache for current session de-duping
    "meetings":     [],      # confirmed calendar events
    "brd_jobs":     {},      # project_id → brd result
    "authenticated":False,
    "owner_email":  "",
    "ws_clients":   [],
    "summaries":    [],
    "cluster_agent": None,
}
MAX_EMAIL_FETCH = int(os.getenv("MAX_EMAIL_FETCH", "5"))
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
                
                valid_batch_to_process = []
                for email in emails:
                    if email["id"] in store["processed"]:
                        continue
                    ok, reason = should_process_business_email(email)
                    if not ok:
                        store["processed"].add(email["id"])
                        await broadcast({"type":"log","level":"info",
                            "msg":f"Skipped email ({reason}): {email.get('subject','(no subject)')}"})
                        continue
                        
                    email["received_at"] = email.get("date")
                    db_service.upsert_emails([email]) # Persist immediately
                    valid_batch_to_process.append(email)
                
                # Intelligent Batching: If we found valid business emails, 
                # hand them entirely to the PyTorch Cluster Agent to find Project correlations!
                if valid_batch_to_process:
                     asyncio.create_task(process_cluster_batch(valid_batch_to_process))
                     
        except GmailRateLimitError as e:
            sleep_seconds = min(max(e.retry_after_seconds, 30), 900)
            print(f"[NEXUS] Gmail rate-limited. Backing off for {sleep_seconds}s")
            await broadcast({"type":"log","level":"error",
                "msg":f"Gmail API rate limit hit. Retrying in {sleep_seconds}s."})
        except Exception as e:
            print(f"[NEXUS] Poll error: {e}")
        await asyncio.sleep(sleep_seconds)


async def process_cluster_batch(emails: list[dict]):
    """
    Core Intelligence Layer: Parses a batch of noise, clusters by semantic project meaning, 
    and forces the outputs together before running the LangGraph Agent pipeline.
    This limits API tokens by merging 5 separate emails into 1 cohesive "Project Bucket"!
    """
    await broadcast({"type":"log", "level":"info", "msg":f"Aggregating {len(emails)} live emails into ML Project Clustering Engine..."})
    
    # 1. Parse into standardized format
    parsed_docs = []
    for em in emails:
        raw_text = f"Subject: {em.get('subject', '')}\nFrom: {em.get('sender', '')}\n\n{em.get('body', '')}"
        parsed = MultiModalParsers.parse_enron_email(raw_text, doc_id=em['id'])
        # Bind the original dict so we can still auto-reply if needed
        parsed['metadata']['original_dict'] = em 
        parsed_docs.append(parsed)

    # 2. Cluster mathematically!
    try:
        agent = store.get("cluster_agent")
        if agent is None:
            agent = ProjectClusteringAgent(distance_threshold=0.75)  # loosened from 0.60 to catch more variations
            store["cluster_agent"] = agent
            
        cluster_buckets = agent.cluster_documents(parsed_docs)
    except Exception as e:
        await broadcast({"type":"log", "level":"error", "msg":f"ML Clustering error: {e}"})
        # Fallback to single emails in one massive cluster if Torch blew up
        cluster_buckets = {0: parsed_docs}
        
    await broadcast({"type":"log", "level":"info", "msg":f"Successfully isolated {len(cluster_buckets)} distinct projects from inbox batch."})

    # 3. Fire pipelines for each Project Cluster
    for cluster_id, docs in cluster_buckets.items():
        theme = ProjectClusteringAgent.identify_cluster_theme(docs)
        await broadcast({"type":"log", "level":"info", "msg":f"AI identified Cluster: {theme} ({len(docs)} emails) — awaiting human approval."})
        
        # Merge unified project data
        composite_body = "\n\n---\n\n".join([f"EMAIL REF:\n{d['clean_text']}" for d in docs])
        
        # Create a proxy 'email' object representing the entire Project Bucket
        mock_cluster_email = {
            "id": f"cluster_{uuid.uuid4().hex[:8]}",
            "thread_id": f"thread_cluster_{cluster_id}",
            "sender": "Project Grouping (AI)",
            "subject": f"Project Cluster: {theme} ({len(docs)} emails)",
            "body": composite_body,
            "snippet": f"This cluster contains {len(docs)} emails. Approve to generate a unified BRD.",
            "attachments": [],
            "force_intent": "brd",
            "cluster_raw_emails": [d['metadata']['original_dict'] for d in docs]
        }
        
        # Instead of auto-running run_agent(), we push a Pending Cluster to the dashboard!
        action = {
            "id":          mock_cluster_email["id"],
            "thread_id":   mock_cluster_email["thread_id"],
            "project_name": theme, # Suggested name
            "email_ids":   [d['doc_id'] for d in docs], # IDs to link on approve
            "email":       mock_cluster_email,
            "intent":      "brd",
            "urgency":     45,
            "sentiment":   "neutral",
            "status":      "pending_cluster", # Custom HITL status
            "section":     "brd",
            "summary":     f"AI Clustered {len(docs)} related emails into Project: {theme}",
            "draft_body":  "Pending human approval to trigger BRD Extractor...",
            "created_at":  datetime.utcnow().isoformat()
        }
        
        store["actions"].insert(0, action)
        await broadcast({"type": "new_action", "payload": action})
        await broadcast({"type":"log", "level":"warn", "msg":f"Cluster '{theme}' sent to UI for human approval."})

async def process_email(email: dict, thread_emails_override: list = None):
    """Run LangGraph agent on one cohesive simulated or real email, then broadcast result."""
    await broadcast({"type":"log","level":"info",
        "msg":f"LLM Processing: {email.get('subject', '(no subject)')}"})

    try:
        creds = load_credentials()
        thread_emails = thread_emails_override or []
        
        # Only fetch real threads if this isn't a mock cluster and has a thread_id
        if creds and email.get("thread_id") and not thread_emails_override and not email["id"].startswith("cluster"):
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
        import traceback
        traceback.print_exc()
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

    if not is_business_email and not email["id"].startswith("cluster"):
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
        
        # Check if it was a project cluster, write to the specific brd_results folder, else temp
        if email["id"].startswith("cluster_"):
            RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "brd_results")
            os.makedirs(RESULTS_DIR, exist_ok=True)
            docx_path = os.path.join(RESULTS_DIR, f"BRD_{job_id}.docx")
        else:
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
        "msg":f"Action Logged: {email.get('subject')} | status={action['status']}"})

    if AUTO_SEND_REPLIES and action["status"] == "pending" and not email["id"].startswith("cluster"):
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
    # Preload the 90MB PyTorch Engine on startup instead of mid-poll!
    print("[NEXUS] Booting PyTorch Clustering Engine gracefully... 🤖")
    try:
        agent = ProjectClusteringAgent(distance_threshold=0.6)
        store["cluster_agent"] = agent
        print("[NEXUS] PyTorch Clustering Agent Loaded.")
    except Exception as e:
        print(f"[NEXUS] Warning: Could not preload Cluster Agent: {e}")
        
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
    from fastapi.responses import RedirectResponse
    try:
        creds = exchange_code(code, state=state)
        save_credentials(creds)
        store["authenticated"] = True
        try:
            store["owner_email"] = get_owner_email(creds)
        except Exception:
            pass
        # Broadcast to any open WS tabs, then redirect the callback tab back to dashboard
        await broadcast({"type": "auth", "status": "ok", "email": store["owner_email"]})
        # Redirect user back to dashboard — page will reload and checkAuth() will see token.json
        return RedirectResponse(url="/?auth=success")
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
    # Also ensure store has owner_email populated for WS init messages
    if creds and not store.get("owner_email"):
        try:
            store["owner_email"] = get_owner_email(creds)
            store["authenticated"] = True
        except Exception:
            pass
    return {"authenticated": creds is not None,
            "email": store.get("owner_email", "")}


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
    
    # Bypass filters for manual processing
    asyncio.create_task(process_email(email))
    return {"status":"processing","email_id":email_id}

from pydantic import BaseModel
class ClusterRequest(BaseModel):
    email_ids: list[str]
    title: str = ""

@app.post("/api/emails/cluster-manual")
async def manual_group_process(req: ClusterRequest):
    """Bypass PyTorch ML and force specific emails into a User-Defined Project Cluster."""
    selected_emails = [e for e in store.get("latest_emails", []) if e.get("id") in req.email_ids]
    if not selected_emails:
        return {"error": "No matching emails found in current inbox batch. Fetch first."}
    
    title = req.title or "User Override Cluster"
    composite_body = "\n\n---\n\n".join([f"EMAIL REF:\nSubject: {d['subject']}\n{d.get('body','')}" for d in selected_emails])
    
    mock_cluster_email = {
        "id": f"cluster_{uuid.uuid4().hex[:8]}",
        "thread_id": f"thread_user_{uuid.uuid4().hex[:4]}",
        "sender": "Manual Selection (User)",
        "subject": f"Overrides: {title} ({len(selected_emails)} emails)",
        "body": composite_body,
        "attachments": [],
        "force_intent": "brd",
    }
    
    await broadcast({"type":"log", "level":"warn", "msg":f"USER OVERRIDE: Forcing LangGraph extraction on {len(selected_emails)} emails directly!"})
    asyncio.create_task(process_email(mock_cluster_email, thread_emails_override=selected_emails))
    return {"status": "processing", "message": "Manual override triggered directly to LangGraph"}


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
    
    # If this is a pending cluster approval, trigger the BRD agent!
    if action["status"] == "pending_cluster":
        action["status"] = "processing_brd"
        await broadcast({"type":"action_update", "id":action_id, "status":"processing_brd"})
        
        # 1. Create the persistent project in Supabase
        proj_name = action.get("project_name", "New Project")
        p = db_service.create_project(proj_name, action["summary"])
        project_id = p.get("id")
        
        # 2. Link all emails to this project
        email_ids = action.get("email_ids", [])
        for eid in email_ids:
            db_service.link_email_to_project(eid, project_id)
            
        await broadcast({"type":"log", "level":"ok", "msg":f"Project '{proj_name}' created (ID: {project_id}). Emails linked."})
        await broadcast({"type":"log", "level":"warn", "msg":f"Human Approved Cluster! Firing BRD Extractor..."})
        
        # 3. Fire background task with project context
        mock_email = action["email"]
        mock_email["project_id"] = project_id # Pass this down to the graph
        
        thread_emails = action["email"].pop("cluster_raw_emails", [])
        asyncio.create_task(process_email(mock_email, thread_emails_override=thread_emails))
        return {"status": "processing_brd", "project_id": project_id}
        
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
    cluster_actions = [a for a in store["actions"] if a.get("status") == "pending_cluster"]
    unassigned = db_service.get_unassigned_emails()
    projects = db_service.get_projects()
    
    return {
        "processed":       len(store["processed"]),
        "unassigned_emails": len(unassigned),
        "total_projects":  len(projects),
        "meetings":        len(store["meetings"]),
        "escalations":     len([a for a in store["actions"] if a["status"]=="escalated"]),
        "pending":         len([a for a in store["actions"] if a["status"]=="pending"]),
        "pending_clusters": len(cluster_actions),
        "brds_generated":  len(store["brd_jobs"]),
        "authenticated":   creds is not None,
        "owner_email":     store.get("owner_email",""),
        "auto_send":       AUTO_SEND_REPLIES,
    }

@app.get("/api/metrics")
async def get_metrics():
    """Detailed pipeline metrics for the evaluation dashboard and judges."""
    all_actions = store["actions"]
    by_intent   = {}
    by_status   = {}
    for a in all_actions:
        intent = a.get("intent", "unknown")
        status = a.get("status", "unknown")
        by_intent[intent] = by_intent.get(intent, 0) + 1
        by_status[status] = by_status.get(status, 0) + 1
    
    brds = store["brd_jobs"]
    return {
        "summary": {
            "total_emails_processed": len(store["processed"]),
            "total_actions_created":  len(all_actions),
            "total_brds_generated":   len(brds),
            "total_meetings_created": len(store["meetings"]),
            "total_escalations":      by_status.get("escalated", 0),
            "pending_cluster_approvals": by_status.get("pending_cluster", 0),
        },
        "intent_breakdown":  by_intent,
        "status_breakdown":  by_status,
        "brd_titles": [j["result"].get("title", "BRD") for j in brds.values()][:10],
        "recent_activity": store["summaries"][:20],
        "pipeline": {
            "langgraph_nodes": ["intent_router", "brd_extract", "brd_gap_detect", "brd_writer", "brd_assembler", "calendar_agent", "reply_composer", "escalation"],
            "clustering_model": "sentence-transformers/all-MiniLM-L6-v2",
            "llm_model":        os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile"),
            "llm_provider":     "Groq",
        }
    }

@app.get("/api/summary")
async def get_summary():
    unassigned = db_service.get_unassigned_emails()
    projects = db_service.get_projects()
    
    return {
        "overview": {
            "processed": len(store["processed"]),
            "unassigned_inbox": len(unassigned),
            "projects_active": len(projects),
            "actions": len(store["actions"]),
            "escalations": len([a for a in store["actions"] if a["status"]=="escalated"]),
            "brds_generated": len(store["brd_jobs"]),
            "meetings": len(store["meetings"]),
            "auto_send_enabled": AUTO_SEND_REPLIES,
        },
        "recent": store["summaries"][:100],
    }


@app.get("/api/stats")
async def get_stats():
    unassigned = db_service.get_unassigned_emails()
    projects = db_service.get_projects()
    
    return {
        "processed": len(store["processed"]),
        "unassigned_emails": len(unassigned),
        "total_projects": len(projects),
        "pending": len([a for a in store["actions"] if a["status"]=="pending"]),
        "pending_clusters": len([a for a in store["actions"] if a["status"]=="pending_cluster"]),
        "escalations": len([a for a in store["actions"] if a["status"]=="escalated"]),
        "brds_generated": len(store["brd_jobs"]),
        "meetings": len(store["meetings"]),
        "authenticated": True if load_credentials() else False
    }


# ══════════════════════════════════════════════════════════════
# PROJECTS & PERSISTENCE (SUPABASE)
# ══════════════════════════════════════════════════════════════
@app.get("/api/projects")
async def list_projects():
    return {"projects": db_service.get_projects()}

@app.post("/api/projects")
async def add_project(data: dict):
    name = data.get("name", "New Project")
    desc = data.get("description", "")
    p = db_service.create_project(name, desc)
    await broadcast({"type":"log","level":"ok","msg":f"Project '{name}' created in DB."})
    return p

@app.get("/api/emails/unassigned")
async def get_unassigned():
    return {"emails": db_service.get_unassigned_emails()}

@app.post("/api/projects/{project_id}/assign-email")
@app.post("/api/projects/{project_id}/attach_email")
async def assign_email(project_id: str, data: dict):
    email_id = data.get("email_id")
    if not email_id: return {"error":"Missing email_id"}
    db_service.link_email_to_project(email_id, project_id)
    await broadcast({"type":"log","level":"info","msg":f"Email linked to project {project_id}"})
    return {"status":"linked"}

@app.post("/api/projects/{project_id}/upload-doc")
async def upload_project_doc(project_id: str, file: UploadFile = File(...)):
    """Upload a transcript/PDF directly to a project bucket."""
    content = await file.read()
    # Parse content using MultiModalParsers
    parsed_text = MultiModalParsers.dispatch(content, file.filename)
    
    # Auto-detect type from extension
    ext = file.filename.split(".")[-1].lower()
    doc_type = "pdf" if ext == "pdf" else "transcript"
    
    doc = db_service.add_document(project_id, file.filename, parsed_text, doc_type)
    await broadcast({"type":"log","level":"ok","msg":f"Document '{file.filename}' added to project."})
    return doc

@app.get("/api/projects/{project_id}/context")
async def get_proj_context(project_id: str):
    ctx = db_service.get_project_context_details(project_id)
    return ctx

@app.post("/api/projects/{project_id}/generate-brd")
async def generate_project_brd(project_id: str):
    """Trigger the LangGraph agent on the FULL project context collected in the DB."""
    p = db_service.get_project_by_id(project_id)
    if not p: return {"error":"Project not found"}
    
    context_str = db_service.get_project_context_string(project_id)
    if not context_str:
        return {"error": "Project context is empty. Link some emails or upload documents first."}
    
    # Create a simulated 'super email' that represents the project context
    master_query = {
        "id": f"proj_{project_id[:8]}",
        "thread_id": f"proj_{project_id[:8]}",
        "sender": "Project Context (DB)",
        "subject": f"Project BRD Generation: {p.get('name')}",
        "body": context_str,
        "project_id": project_id, # Very important: links result back to project
        "force_intent": "brd"
    }
    
    await broadcast({"type":"log", "level":"info", "msg":f"Starting Project-Wide AI Extraction for: {p.get('name')}"})
    asyncio.create_task(process_email(master_query))
    return {"status":"processing", "project_id": project_id}


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
    """Upload a transcript, email, chat log, or PDF to generate a full BRD."""
    raw_bytes = await file.read()
    filename  = file.filename or "document.txt"
    doc_id    = str(uuid.uuid4())[:8]
    
    # Use the MultiModal dispatcher to parse based on file type
    parsed = MultiModalParsers.from_upload(raw_bytes, filename, doc_id)
    
    await broadcast({"type":"log", "level":"info", 
        "msg":f"Parsing uploaded {parsed['source_type']}: {filename}"})
    
    fake_email = {
        "id":          doc_id,
        "thread_id":   doc_id,
        "sender":      "upload@nexus.ai",
        "subject":     f"BRD Request: {filename}",
        "body":        parsed["clean_text"][:3000],
        "attachments": [{"name": filename, "content": parsed["clean_text"], "type": parsed["source_type"]}],
        "force_intent": "brd",
    }
    asyncio.create_task(process_email(fake_email))
    return {"status":"processing", "email_id": doc_id, "source_type": parsed["source_type"]}

@app.get("/api/brd/{job_id}/result")
async def get_brd(job_id: str):
    job = store["brd_jobs"].get(job_id)
    if not job: return {"error":"Not found"}
    return job["result"]

@app.get("/api/brd/{job_id}/sections")
async def get_brd_sections(job_id: str):
    """Return BRD section text for in-page preview without downloading DOCX."""
    job = store["brd_jobs"].get(job_id)
    if not job: return {"error":"Not found"}
    result = job["result"]
    return {
        "title":    result.get("title", "BRD"),
        "version":  result.get("version", "1.0"),
        "status":   result.get("status", "Draft"),
        "sections": result.get("sections", {}),
        "metadata": result.get("metadata", {}),
    }

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
    return {"brds": list(reversed([
        {"job_id": jid, "title": j["result"].get("title","BRD"),
         "email_id": j.get("email_id"),
         "sections_count": len(j["result"].get("sections",{})),
         "metadata": j["result"].get("metadata",{})}
        for jid, j in store["brd_jobs"].items()
    ]))}


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
