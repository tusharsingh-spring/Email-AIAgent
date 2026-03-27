import os, json, asyncio, re, time
from typing import TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
import services.db_service as db_service
from groq import Groq
from dotenv import load_dotenv
load_dotenv()
MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
ESCALATION_THRESHOLD = int(os.getenv("ESCALATION_THRESHOLD", "70"))
LOCAL_MODEL_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "models", "brd_t5_finetuned")
USE_LOCAL = os.getenv("LOCAL_BRD_MODEL", "false").lower() in ("1", "true", "yes") and os.path.isdir(LOCAL_MODEL_DIR)
_groq_client = None
_local_model  = None
_local_tok    = None


def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("Missing GROQ_API_KEY in environment")
        _groq_client = Groq(api_key=api_key)
    return _groq_client


def _get_local_model():
    """Lazy-load the fine-tuned T5 model from disk (GPU if available)."""
    global _local_model, _local_tok
    if _local_model is None:
        try:
            import torch
            from transformers import T5ForConditionalGeneration, T5Tokenizer
            print(f"[Local LLM] Loading fine-tuned T5 from {LOCAL_MODEL_DIR}")
            _local_tok   = T5Tokenizer.from_pretrained(LOCAL_MODEL_DIR)
            _local_model = T5ForConditionalGeneration.from_pretrained(LOCAL_MODEL_DIR)
            device = "cuda" if torch.cuda.is_available() else "cpu"
            _local_model = _local_model.to(device)
            _local_model.eval()
            print(f"[Local LLM] T5 loaded on {device}")
        except Exception as e:
            print(f"[Local LLM] Failed to load: {e}")
            _local_model = None
    return _local_model, _local_tok


def _llm_local(system: str, user: str) -> dict | str:
    """Run a query through the local fine-tuned T5 model."""
    model, tok = _get_local_model()
    if model is None:
        return {}
    try:
        import torch
        prompt = f"{system}\n\n{user[:1000]}"
        inputs = tok(prompt, return_tensors="pt", max_length=512, truncation=True)
        inputs = {k: v.to(model.device) for k, v in inputs.items()}
        with torch.no_grad():
            out = model.generate(**inputs, max_length=256, num_beams=4, early_stopping=True)
        text = tok.decode(out[0], skip_special_tokens=True)
        # Parse key: value structured output from T5
        result = {}
        for part in text.split(" | "):
            if ":" in part:
                k, _, v = part.partition(":")
                result[k.strip().replace(" ", "_")] = v.strip()
        return result if result else text
    except Exception as e:
        print(f"[Local LLM] Inference failed: {e}")
        return {}


# ── Shared State (flows through every node) ─────────────────
class AgentState(TypedDict):
    # Input
    email_id:        str
    thread_id:       str
    sender:          str
    subject:         str
    body:            str
    attachments:     list[dict]      # [{name, content, type}]
    all_thread_emails: list[dict]
    force_intent:     str
    project_id:       str             # Supabase link for full context retrieval

    # Intent parsing
    intent:          str             # email | schedule | cancel | status | brd | escalate | general
    urgency_score:   int
    sentiment:       str
    entities:        dict
    summary:         str
    is_business_email: bool
    business_category: str
    urgency_reason: str

    # BRD pipeline (only populated if intent==brd)
    brd_extracted:   dict
    brd_gaps:        dict
    brd_sections:    dict
    brd_final:       dict
    brd_docx_path:   str

    # Scheduling (only populated if intent==schedule)
    proposed_slots:  list[dict]
    free_slot:       str             # ISO datetime of chosen slot
    meeting_title:   str
    participants:    list[str]
    calendar_event:  dict

    # Reply
    draft_subject:   str
    draft_body:      str

    # Control flow
    needs_human:     bool
    human_approved:  bool
    human_edits:     str
    action_taken:    str
    error:           str


def _parse_json_loose(text: str) -> dict | None:
    try:
        return json.loads(text)
    except Exception:
        pass

    # Best-effort cleanup for common LLM JSON issues: trailing commas.
    cleaned = re.sub(r",\s*([}\]])", r"\1", text)
    try:
        return json.loads(cleaned)
    except Exception:
        return None


def _llm(system: str, user: str, max_retries: int = 3) -> dict | str:
    """
    Tiered LLM Dispatcher with Resilience:
    1. Try Groq (Model of choice for quality).
    2. Retry on 429 (Rate Limit) with exponential backoff.
    3. Fall back to local T5 only if all else fails.
    """
    # 1. Try Groq with backoff
    for attempt in range(max_retries):
        try:
            client = _get_groq_client()
            resp = client.chat.completions.create(
                model=MODEL,
                messages=[{"role":"system","content":system},{"role":"user","content":user}],
                temperature=0.1, max_tokens=2000,
            )
            raw = (resp.choices[0].message.content or "").strip()
            
            # Cleanup & Parse
            raw = re.sub(r"```json\n?|\n?```", "", raw).strip()
            parsed = _parse_json_loose(raw)
            if parsed is not None:
                return parsed
            
            m = re.search(r"\{.*\}", raw, flags=re.S)
            if m:
                parsed = _parse_json_loose(m.group(0))
                if parsed is not None:
                    return parsed
            # Return raw if not JSON but call succeeded
            return raw

        except Exception as e:
            err_msg = str(e)
            print(f"[LLM] Groq attempt {attempt+1} failed: {err_msg[:120]}")
            
            # If it's a rate limit (429), sleep and retry
            if "429" in err_msg or "rate_limit" in err_msg.lower():
                wait = (2 ** attempt) * 2 # 2s, 4s, 8s...
                print(f"[LLM] Rate limit hit. Backing off for {wait}s...")
                time.sleep(wait)
                continue
            
            # For other errors, break and fall back
            break

    # 2. Final Fallback to local
    if os.path.isdir(LOCAL_MODEL_DIR):
        print("[LLM] Falling back to local fine-tuned T5 model after Groq exhaustion...")
        return _llm_local(system, user)
    
    return {}

    raw = re.sub(r"```json\n?|\n?```", "", raw).strip()
    parsed = _parse_json_loose(raw)
    if parsed is not None:
        return parsed

    # Try to recover a JSON object from mixed text output.
    m = re.search(r"\{.*\}", raw, flags=re.S)
    if m:
        parsed = _parse_json_loose(m.group(0))
        if parsed is not None:
            return parsed
    return raw


def _heuristic_intent(subject: str, body: str, force_intent: str = "") -> tuple[str, int, str, bool, str, str]:
    text = f"{subject}\n{body}".lower()
    brd_kw = ["brd", "business requirements", "requirements document", "spec document", "document the project", "write up requirements"]
    sched_kw = ["schedule", "meeting", "call", "sync", "availability", "calendar"]
    urgent_kw = ["urgent", "asap", "immediately", "critical", "escalate"]
    frustr_kw = ["not happy", "frustrated", "disappointed", "angry", "unacceptable"]
    non_business_kw = ["otp", "verification code", "newsletter", "promotion", "sale", "discount", "security alert", "social", "offer"]

    if force_intent == "brd":
        return "brd", 35, "neutral", True, "requirements", "Forced BRD intent."

    intent = "general"
    if any(k in text for k in brd_kw):
        intent = "brd"
    elif any(k in text for k in sched_kw):
        intent = "schedule"
    elif "status" in text or "update" in text:
        intent = "status"

    is_business = not any(k in text for k in non_business_kw)
    category = "operations" if any(k in text for k in ["invoice", "payment", "delivery", "contract"]) else "general_work"
    urgency = 25
    if any(k in text for k in urgent_kw):
        urgency = 68
    if any(k in text for k in frustr_kw):
        urgency = max(urgency, 78)

    sentiment = "neutral"
    if any(k in text for k in frustr_kw):
        sentiment = "frustrated"
    elif urgency >= 75:
        sentiment = "urgent"
    reason = "Keyword-based fallback urgency."
    return intent, urgency, sentiment, is_business, category, reason


# ══════════════════════════════════════════════════════════════
# NODE 1 — Intent Router
# Decides which downstream agent handles this email
# ══════════════════════════════════════════════════════════════
def intent_router_node(state: AgentState) -> AgentState:
    if state.get("force_intent") == "brd":
        state["intent"] = "brd"
        state["urgency_score"] = 35
        state["sentiment"] = "neutral"
        state["entities"] = {}
        state["summary"] = "Forced BRD pipeline for uploaded transcript/document."
        state["is_business_email"] = True
        state["business_category"] = "requirements"
        state["urgency_reason"] = "Forced BRD processing."
        state["needs_human"] = False
        return state

    system = """Classify this email and extract entities. Return ONLY valid JSON:
{
  "is_business_email": true,
  "business_category": "requirements|project|client|operations|support|finance|other",
  "intent": "schedule|cancel|update|status|brd|escalate|general",
  "urgency_score": 0-100,
  "urgency_reason": "why this score",
  "sentiment": "positive|neutral|frustrated|urgent",
  "participants": ["email1"],
  "proposed_slots": [{"date_raw": "next Tuesday 3pm", "timezone": "EST"}],
  "duration_minutes": 30,
  "meeting_title": "string or null",
  "wants_brd": false,
  "summary": "one sentence",
  "entities": {"names":[], "orgs":[], "dates":[]}
}

Rules:
- is_business_email=false for newsletters/promotions/otp/security alerts/social notifications.
- intent=brd if email contains: 'requirements document', 'BRD', 'business requirements', 'spec document', 'write up requirements', 'document the project'
- intent=escalate if urgency_score > 70 OR sentiment = frustrated/urgent
- intent=schedule if any meeting/call/sync requested
- intent=status if asking for update/progress
"""
    result = _llm(system, f"From: {state['sender']}\nSubject: {state['subject']}\n\nBody:\n{state['body'][:2000]}")

    if isinstance(result, dict) and result:
        state["is_business_email"] = bool(result.get("is_business_email", True))
        state["business_category"] = result.get("business_category", "other")
        state["intent"]        = result.get("intent", "general")
        state["urgency_score"] = int(result.get("urgency_score", 0) or 0)
        state["urgency_reason"] = result.get("urgency_reason", "")
        state["sentiment"]     = result.get("sentiment", "neutral")
        state["entities"]      = result.get("entities", {})
        state["summary"]       = result.get("summary", "")
        state["participants"]  = result.get("participants", [state["sender"]])
        state["proposed_slots"]= result.get("proposed_slots", [])
        state["meeting_title"] = result.get("meeting_title") or state["subject"]
        is_explicit_escalation = (state["intent"] == "escalate")
        has_urgent_sentiment = state["sentiment"] in ("frustrated", "urgent")
        state["needs_human"] = is_explicit_escalation or (
            state["urgency_score"] >= ESCALATION_THRESHOLD and has_urgent_sentiment
        )
    else:
        intent, urgency, sentiment, is_business, category, reason = _heuristic_intent(
            state.get("subject", ""), state.get("body", ""), state.get("force_intent", "")
        )
        state["is_business_email"] = is_business
        state["business_category"] = category
        state["intent"] = intent
        state["urgency_score"] = urgency
        state["urgency_reason"] = reason
        state["sentiment"] = sentiment
        state["entities"] = {}
        state["summary"] = f"Detected intent={intent} via fallback classifier."
        state["participants"] = [state.get("sender", "")]
        state["proposed_slots"] = []
        state["meeting_title"] = state.get("subject", "Meeting")
        state["needs_human"] = urgency >= ESCALATION_THRESHOLD and sentiment in ("frustrated", "urgent")

    return state


# ══════════════════════════════════════════════════════════════
# NODE 2 — BRD Extraction Agent
# Extracts structured requirements from email + thread context
# ══════════════════════════════════════════════════════════════
def brd_extraction_node(state: AgentState) -> AgentState:
    # 1. If we have a project_id, pull the DEEP context from Supabase (all past emails + docs)
    project_id = state.get("project_id")
    if project_id:
        print(f"[Agent] Retrieving proper context for Project: {project_id}")
        all_content = db_service.get_project_context(project_id)
    else:
        # Fallback to current email/thread if no project linked yet
        all_content = state["body"]
        for prev in state.get("all_thread_emails", [])[-5:]:
            all_content += f"\n\n---\nFrom: {prev.get('sender','')}\n{prev.get('body','')[:800]}"

    # 2. Also include any local session attachments
    for att in state.get("attachments", []):
        if att.get("content"):
            all_content += f"\n\n--- ATTACHMENT: {att['name']} ---\n{att['content'][:1500]}"

    # 3. Advanced NLP Pre-processing: Noise Reduction (Enron / AMI filters)
    def clean_noisy_content(text: str) -> str:
        import re
        # Remove Enron header noise (Message-ID, X-To, X-From)
        text = re.sub(r"(?i)(Message-ID|Date|From|To|Subject|Mime-Version|Content-Type|X-[a-zA-Z-]+):.*?\n", "", text)
        # Remove transcript filler words (AMI dataset noise)
        text = re.sub(r"\b(um|uh|like|you know|I mean|yeah|okay|right)\b", "", text, flags=re.IGNORECASE)
        # Compress multiple newlines
        return re.sub(r"\n{3,}", "\n\n", text).strip()

    cleaned_content = clean_noisy_content(all_content)
    
    # 4. Expanded clean context window
    context_to_process = cleaned_content[:8000]

    system = """You are a senior business analyst. Extract ALL requirements from these communications.
Return ONLY valid JSON:
{
  "project_name": "string",
  "project_description": "2-3 sentences",
  "business_problem": "string",
  "stakeholders": [{"name":"","role":"","needs":""}],
  "business_objectives": [{"objective":"","metric":"","priority":"high|medium|low"}],
  "scope_in": ["item"],
  "scope_out": ["item"],
  "functional_requirements": [{"id":"FR-001","title":"","description":"","priority":"high|medium|low"}],
  "non_functional_requirements": [{"id":"NFR-001","category":"performance|security|scalability|usability","requirement":""}],
  "constraints": ["string"],
  "assumptions": ["string"],
  "risks": [{"risk":"","impact":"high|medium|low","mitigation":""}],
  "timeline": {"start":null,"end":null,"milestones":[]},
  "success_metrics": ["string"],
  "decisions_made": ["string"],
  "feature_priorities": [{"feature":"","priority":"P0|P1|P2","rationale":""}]
}"""

    result = _llm(system, f"Communications:\n\n{context_to_process}")
    if isinstance(result, dict) and result:
        state["brd_extracted"] = result
    else:
        # DEEP HEURISTIC FALLBACK: If LLM fails, we manually construct a project-specific skeleton
        # instead of a generic "Recovery" document.
        print("[Agent] LLM Extraction failed. Using Deep Heuristic Fallback for extraction.")
        subj = (state.get("subject") or "Project").replace("BRD:", "").strip()[:80]
        desc = state.get("body", "")[:1000] # Use more body content
        
        state["brd_extracted"] = {
            "project_name": subj or "Requirement Document",
            "project_description": f"Extracted requirements for {subj}. {desc[:200]}...",
            "business_problem": desc[:300] if len(desc) > 50 else "Capture and document business needs.",
            "stakeholders": [{"name": state.get("sender","User"), "role":"Stakeholder", "needs":"Documented requirements"}],
            "business_objectives": [{"objective":"Fulfill requested capabilities","metric":"Success","priority":"high"}],
            "scope_in": ["Primary requested features"],
            "scope_out": ["Out of scope items"],
            "functional_requirements": [{"id":"FR-001","title":"Core Feature","description":"Standard project requirement fulfillment.","priority":"high"}],
            "non_functional_requirements": [{"id":"NFR-001","category":"reliability","requirement":"System must be stable."}],
            "constraints": ["Limited by extraction success."],
            "assumptions": ["Context provided is accurate."],
            "risks": [{"risk":"Missing details","impact":"high","mitigation":"Human review required."}],
            "timeline": {"start":None,"end":None,"milestones":["Current Draft"]},
            "success_metrics": ["Requirement fulfillment"],
            "decisions_made": [],
            "feature_priorities": [{"feature":"Core Business Logic","priority":"P0","rationale":"Base requirement"}],
        }
    return state


# ══════════════════════════════════════════════════════════════
# NODE 3 — BRD Gap Detector
# ══════════════════════════════════════════════════════════════
def brd_gap_node(state: AgentState) -> AgentState:
    system = """Review this extracted BRD data for completeness. Return ONLY valid JSON:
{
  "completeness_score": 0-100,
  "can_proceed": true,
  "critical_gaps": [{"field":"","issue":"","question":""}],
  "recommended_questions": [{"priority":"must_have|nice_to_have","question":"","why":""}]
}
Set can_proceed=false only if >3 critical gaps exist."""

    result = _llm(system, f"Extracted data:\n{json.dumps(state.get('brd_extracted',{}), indent=2)[:3000]}")
    if isinstance(result, dict):
        state["brd_gaps"] = result
        # If gaps are not critical, proceed
        if not result.get("can_proceed", True):
            state["needs_human"] = True
    return state


# ══════════════════════════════════════════════════════════════
# NODE 4 & 5 — High-Efficiency BRD Generator (Single Call)
# ══════════════════════════════════════════════════════════════
async def _generate_brd_section(project_name: str, section_key: str, section_desc: str, extracted: dict) -> str:
    """Helper to generate a single BRD section if the master call fails."""
    system = f"You are a Business Analyst. Write the '{section_key}' section for '{project_name}'. {section_desc}. Return ONLY the text content."
    user = f"Context: {json.dumps(extracted, indent=2)[:3000]}"
    res = await asyncio.get_event_loop().run_in_executor(None, _llm, system, user)
    return str(res) if res else "Context unavailable for this section."

async def brd_writer_node(state: AgentState) -> AgentState:
    """
    High-Efficiency BRD Generator.
    Tries a single efficient call first, falls back to section-by-section if needed.
    """
    extracted = state.get("brd_extracted", {})
    project_name = extracted.get("project_name", state.get("subject", "Project")).replace("BRD:", "").strip()
    
    ctx = json.dumps(extracted, indent=2)[:4000]

    system = f"""You are a Lead Business Analyst. Create a FINAL Business Requirements Document for '{project_name}'.
Return ONLY valid JSON with this EXACT structure:
{{
  "title": "BRD: {project_name}",
  "version": "1.0",
  "status": "Draft",
  "sections": {{
    "executive_summary": "High-level overview...",
    "business_objectives": "3-5 SMART goals...",
    "scope": "In-Scope, Out-of-Scope, Assumptions...",
    "functional_requirements": "FR table...",
    "non_functional_requirements": "Performance, Security...",
    "stakeholders_decisions": "Stakeholders list...",
    "risks_constraints": "Risk matrix...",
    "feature_prioritization": "MoSCoW...",
    "timeline_milestones": "Milestones..."
  }},
  "metadata": {{ "project_name": "{project_name}" }}
}}"""

    loop = asyncio.get_event_loop()
    result = await loop.run_in_executor(None, _llm, system, f"Extracted Requirements:\n{ctx}")
    
    if isinstance(result, dict) and result.get("sections"):
        state["brd_final"] = result
        state["brd_sections"] = result["sections"]
        return state

    # --- LAYER 2 FALLBACK: Section-by-Section ---
    print(f"[LLM] Primary BRD call failed for {project_name}. Falling back to Section-by-Section generation...")
    sections_schema = {
        "executive_summary": "Summarize the project vision and problem being solved",
        "business_objectives": "List 3-5 specific business goals",
        "scope": "Define what is in and out of scope",
        "functional_requirements": "Detail the specific features and user stories",
        "non_functional_requirements": "Specify performance, security, and quality needs",
        "stakeholders_decisions": "Identify key people and technical decisions",
        "risks_constraints": "List potential blockers and risks",
        "feature_prioritization": "Rank features by business value",
        "timeline_milestones": "Propose a high-level delivery schedule"
    }
    
    final_sections = {}
    for key, desc in sections_schema.items():
        # Generate each section individually to stay under token limits / prevent JSON parsing bombs
        final_sections[key] = await _generate_brd_section(project_name, key, desc, extracted)
        await asyncio.sleep(0.5) # Slight pause to avoid hitting rate limits between chunks

    state["brd_sections"] = final_sections
    state["brd_final"] = {
        "title": f"BRD: {project_name}",
        "version": "1.0",
        "status": "Advanced Draft",
        "sections": final_sections,
        "metadata": {"project_name": project_name, "is_fragmented_recovery": True}
    }
    return state


def brd_assembler_node(state: AgentState) -> AgentState:
    """Now a pass-through because writer handles everything."""
    return state


# ══════════════════════════════════════════════════════════════
# NODE 6 — Calendar Agent
# Uses real Google Calendar freebusy API
# ══════════════════════════════════════════════════════════════
def calendar_agent_node(state: AgentState) -> AgentState:
    from services.calendar_service import find_free_slot, create_event
    from services.google_auth import load_credentials
    from datetime import datetime
    from email.utils import parseaddr
    import dateparser
    import re

    creds = load_credentials()
    if not creds:
        state["error"] = "Google not authenticated"
        return state

    # Normalize participants to valid email addresses only.
    participants_raw = state.get("participants", []) or []
    participants = []
    for p in participants_raw:
        addr = parseaddr(p)[1] if isinstance(p, str) else ""
        if not addr and isinstance(p, str) and re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", p.strip()):
            addr = p.strip()
        if addr and addr not in participants:
            participants.append(addr)

    # Fall back to sender email for scheduling requests if model missed participants.
    sender_addr = parseaddr(state.get("sender", ""))[1]
    if not participants and sender_addr:
        participants = [sender_addr]

    # Normalize proposed slots to datetime
    duration     = 30  # default

    # Try to find slot from proposed times first
    preferred = None
    for slot in state.get("proposed_slots", []):
        raw = slot.get("date_raw", "")
        parsed = dateparser.parse(raw, settings={"PREFER_DATES_FROM":"future"})
        if parsed:
            preferred = parsed
            break

    try:
        free_slot = find_free_slot(
            creds,
            participants,
            duration_minutes=duration,
            preferred_start=preferred
        )
    except Exception as e:
        state["error"] = f"Calendar free/busy lookup failed: {e}"
        return state

    if free_slot:
        state["free_slot"] = free_slot.isoformat()
        # Create the real calendar event
        try:
            event = create_event(
                creds,
                title=state.get("meeting_title", state.get("subject", "Meeting")),
                start=free_slot,
                duration_minutes=duration,
                attendees=participants
            )
        except Exception as e:
            state["error"] = f"Calendar event creation failed: {e}"
            return state
        state["calendar_event"] = {
            "id": event.get("id"),
            "link": event.get("htmlLink"),
            "start": free_slot.isoformat(),
            "title": state.get("meeting_title"),
        }
    else:
        state["error"] = "No free slot found in next 7 days"

    return state


# ══════════════════════════════════════════════════════════════
# NODE 7 — Reply Composer
# Drafts the outgoing email
# ══════════════════════════════════════════════════════════════
def reply_composer_node(state: AgentState) -> AgentState:
    intent = state.get("intent", "general")

    if intent == "schedule" and state.get("free_slot"):
        from datetime import datetime
        dt = datetime.fromisoformat(state["free_slot"])
        meeting_info = f"\n\nMeeting: {state.get('meeting_title','Meeting')}\nTime: {dt.strftime('%A, %B %d at %I:%M %p UTC')}\nCalendar invite sent to all participants."
    elif intent == "brd" and state.get("brd_final"):
        meeting_info = f"\n\nBRD generated successfully. {state['brd_final'].get('metadata',{}).get('total_fr','?')} functional requirements documented. DOCX attached."
    else:
        meeting_info = ""

    system = f"""Write a professional email reply. Tone: professional and warm.
Always end with:
\n\n─────────────────────────────────────
Sent by NEXUS — Experimental AI Assistant
This message was generated autonomously. Reply if corrections needed.

Return ONLY valid JSON: {{"subject":"Re: ...","body":"full email text"}}"""

    context = f"Original email: {state['subject']}\nFrom: {state['sender']}\nIntent: {intent}\nSummary: {state.get('entities',{})}{meeting_info}"

    # Use human edits if provided
    if state.get("human_edits"):
        context += f"\n\nHuman requested changes: {state['human_edits']}"

    result = _llm(system, context)
    if isinstance(result, dict):
        state["draft_subject"] = result.get("subject", f"Re: {state['subject']}")
        state["draft_body"]    = result.get("body", "")
    elif isinstance(result, str) and result.strip():
        # If model didn't return JSON but did generate text, still use it.
        state["draft_subject"] = state.get("draft_subject") or f"Re: {state.get('subject','Update')}"
        state["draft_body"] = result.strip()
    if not state.get("draft_body"):
        state["draft_subject"] = state.get("draft_subject") or f"Re: {state.get('subject','Update')}"
        state["draft_body"] = (
            "Thank you for your email. We have reviewed your request and are taking the next steps. "
            "Please share any additional constraints or deadlines if needed."
        )
    return state


# ══════════════════════════════════════════════════════════════
# NODE 8 — Escalation Handler
# Routes to human, stops auto-send
# ══════════════════════════════════════════════════════════════
def escalation_node(state: AgentState) -> AgentState:
    state["needs_human"] = True
    state["action_taken"] = "escalated"
    state["draft_body"] = None  # Don't draft — human writes this
    return state


# ══════════════════════════════════════════════════════════════
# ROUTING FUNCTIONS
# ══════════════════════════════════════════════════════════════
def route_intent(state: AgentState) -> Literal["n_brd_extract","n_calendar","n_escalate","n_compose"]:
    intent = state.get("intent", "general")
    if intent == "escalate":
        return "n_escalate"
    if state.get("urgency_score", 0) >= ESCALATION_THRESHOLD and state.get("sentiment") in ("frustrated", "urgent"):
        return "n_escalate"
    if intent == "brd":
        return "n_brd_extract"
    if intent in ("schedule", "cancel", "update"):
        return "n_calendar"
    return "n_compose"

def route_after_brd_gaps(state: AgentState) -> Literal["n_brd_write","n_escalate"]:
    gaps = state.get("brd_gaps", {})
    if not gaps.get("can_proceed", True) and state.get("urgency_score", 0) < ESCALATION_THRESHOLD:
        return "n_escalate"  # needs human clarification
    return "n_brd_write"

def route_after_calendar(state: AgentState) -> Literal["n_compose","n_escalate"]:
    # Missing slot should still get a draft reply rather than forced escalation.
    return "n_compose"

def route_final(state: AgentState) -> Literal["end","n_escalate"]:
    if state.get("needs_human"):
        return "n_escalate"
    return "end"


# ══════════════════════════════════════════════════════════════
# BUILD THE LANGGRAPH
# ══════════════════════════════════════════════════════════════
def build_graph():
    builder = StateGraph(AgentState)

    # Add nodes
    builder.add_node("n_intent_router",    intent_router_node)
    builder.add_node("n_brd_extract",      brd_extraction_node)
    builder.add_node("n_brd_gaps",         brd_gap_node)
    builder.add_node("n_brd_write",        brd_writer_node)
    builder.add_node("n_brd_assemble",     brd_assembler_node)
    builder.add_node("n_calendar",         calendar_agent_node)
    builder.add_node("n_compose",          reply_composer_node)
    builder.add_node("n_escalate",         escalation_node)

    # Entry point
    builder.set_entry_point("n_intent_router")

    # Routing from intent
    builder.add_conditional_edges("n_intent_router", route_intent, {
        "n_brd_extract": "n_brd_extract",
        "n_calendar":    "n_calendar",
        "n_escalate":    "n_escalate",
        "n_compose":     "n_compose",
    })

    # BRD pipeline
    builder.add_edge("n_brd_extract", "n_brd_gaps")
    builder.add_conditional_edges("n_brd_gaps", route_after_brd_gaps, {
        "n_brd_write":  "n_brd_write",
        "n_escalate":   "n_escalate",
    })
    builder.add_edge("n_brd_write",   "n_brd_assemble")
    builder.add_edge("n_brd_assemble","n_compose")

    # Calendar pipeline
    builder.add_conditional_edges("n_calendar", route_after_calendar, {
        "n_compose":  "n_compose",
        "n_escalate": "n_escalate",
    })

    # Final routing
    builder.add_conditional_edges("n_compose", route_final, {
        "end":      END,
        "n_escalate": "n_escalate",
    })
    builder.add_edge("n_escalate", END)

    memory = MemorySaver()
    return builder.compile(checkpointer=memory)


# Singleton graph
_graph = None
def get_graph():
    global _graph
    if _graph is None:
        _graph = build_graph()
    return _graph


async def run_agent(email: dict, thread_emails: list = None, human_edits: str = None) -> AgentState:
    """Run full LangGraph pipeline for one email."""
    graph = get_graph()

    initial_state: AgentState = {
        "email_id":          email.get("id", ""),
        "thread_id":         email.get("thread_id", ""),
        "sender":            email.get("sender", ""),
        "subject":           email.get("subject", ""),
        "body":              email.get("body", ""),
        "attachments":       email.get("attachments", []),
        "all_thread_emails": thread_emails or [],
        "intent":            "",
        "urgency_score":     0,
        "sentiment":         "neutral",
        "entities":          {},
        "summary":           "",
        "is_business_email": True,
        "business_category": "other",
        "urgency_reason":    "",
        "force_intent":      email.get("force_intent", ""),
        "brd_extracted":     {},
        "brd_gaps":          {},
        "brd_sections":      {},
        "brd_final":         {},
        "brd_docx_path":     "",
        "proposed_slots":    [],
        "free_slot":         "",
        "meeting_title":     "",
        "participants":      [],
        "calendar_event":    {},
        "draft_subject":     "",
        "draft_body":        "",
        "needs_human":       False,
        "human_approved":    False,
        "human_edits":       human_edits or "",
        "action_taken":      "",
        "error":             "",
    }

    config = {"configurable": {"thread_id": email.get("thread_id", "default")}}
    result = await graph.ainvoke(initial_state, config=config)
    return result
