"""
NEXUS — LangGraph Multi-Agent Orchestrator
Agents: Email Watcher → Intent Router → BRD Agent → Calendar Agent → Reply Composer
"""

import os, json, asyncio, re
from typing import TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from groq import Groq
from dotenv import load_dotenv
load_dotenv()
MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
ESCALATION_THRESHOLD = int(os.getenv("ESCALATION_THRESHOLD", "70"))
_groq_client = None


def _get_groq_client():
    global _groq_client
    if _groq_client is None:
        api_key = os.getenv("GROQ_API_KEY")
        if not api_key:
            raise RuntimeError("Missing GROQ_API_KEY in environment")
        _groq_client = Groq(api_key=api_key)
    return _groq_client


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


def _llm(system: str, user: str) -> dict | str:
    try:
        client = _get_groq_client()
        resp = client.chat.completions.create(
            model=MODEL,
            messages=[{"role":"system","content":system},{"role":"user","content":user}],
            temperature=0.1, max_tokens=2000,
        )
        raw = (resp.choices[0].message.content or "").strip()
    except Exception as e:
        print(f"[LLM] Groq call failed: {e}")
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
    # Combine current email + thread history
    all_content = state["body"]
    for prev in state.get("all_thread_emails", [])[-5:]:
        all_content += f"\n\n---\nFrom: {prev.get('sender','')}\n{prev.get('body','')[:800]}"

    # Also include attachments
    for att in state.get("attachments", []):
        if att.get("content"):
            all_content += f"\n\n--- ATTACHMENT: {att['name']} ---\n{att['content'][:1500]}"

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

    result = _llm(system, f"Communications:\n\n{all_content[:5000]}")
    if isinstance(result, dict) and result:
        state["brd_extracted"] = result
    else:
        project_name = (state.get("subject") or "Project").replace("BRD Request:", "").strip()[:80]
        state["brd_extracted"] = {
            "project_name": project_name or "Project",
            "project_description": (state.get("body", "")[:240] or "Project requirements collected from communication."),
            "business_problem": "Business requirements need to be captured and formalized.",
            "stakeholders": [{"name": state.get("sender","Stakeholder"), "role":"Requester", "needs":"Clear deliverable scope"}],
            "business_objectives": [{"objective":"Deliver requested solution","metric":"Stakeholder acceptance","priority":"high"}],
            "scope_in": ["Core requested functionality"],
            "scope_out": ["Items not explicitly requested"],
            "functional_requirements": [{"id":"FR-001","title":"Primary workflow","description":"System supports requested workflow.","priority":"high"}],
            "non_functional_requirements": [{"id":"NFR-001","category":"reliability","requirement":"System should operate reliably under normal load."}],
            "constraints": ["Timeline and requirements may evolve with clarifications."],
            "assumptions": ["Provided transcript/email reflects current business need."],
            "risks": [{"risk":"Ambiguous requirements","impact":"medium","mitigation":"Confirm open questions with stakeholders."}],
            "timeline": {"start":None,"end":None,"milestones":["Draft BRD", "Review", "Sign-off"]},
            "success_metrics": ["Business stakeholder approves BRD"],
            "decisions_made": [],
            "feature_priorities": [{"feature":"Core requirements implementation","priority":"P0","rationale":"Direct business need"}],
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
# NODE 4 — BRD Section Writer (parallel sections)
# ══════════════════════════════════════════════════════════════
async def brd_writer_node(state: AgentState) -> AgentState:
    extracted = state.get("brd_extracted", {})
    ctx = json.dumps(extracted, indent=2)[:3000]

    SECTION_PROMPTS = {
        "executive_summary": "Write a professional Executive Summary (2-3 paragraphs) for a BRD. Business language. No JSON.",
        "business_objectives": "Write the Business Objectives section. Numbered list, each with metric. No JSON.",
        "scope": "Write the Project Scope section: In Scope bullet list, Out of Scope bullet list, Assumptions. No JSON.",
        "functional_requirements": "Write Functional Requirements. Format: FR-XXX title, Description, Priority, Acceptance Criteria. No JSON.",
        "non_functional_requirements": "Write Non-Functional Requirements grouped by Performance, Security, Scalability, Reliability. Measurable. No JSON.",
        "stakeholders_decisions": "Write Stakeholders section (roles, interests) AND Key Decisions Made section. No JSON.",
        "risks_constraints": "Write Risks table (Risk | Impact | Probability | Mitigation), Constraints list, Dependencies list. No JSON.",
        "feature_prioritization": "Write Feature Prioritization section. P0/P1/P2 tiers with rationale. No JSON.",
        "timeline_milestones": "Write Timeline & Milestones. Use [TBD] for unknown dates. No JSON.",
    }

    async def write_section(key: str, prompt: str) -> tuple[str, str]:
        loop = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _llm, prompt, f"Project data:\n{ctx}")
        return key, result if isinstance(result, str) else json.dumps(result)

    tasks = [write_section(k, v) for k, v in SECTION_PROMPTS.items()]
    results = await asyncio.gather(*tasks)
    state["brd_sections"] = dict(results)
    return state


# ══════════════════════════════════════════════════════════════
# NODE 5 — BRD Assembler
# ══════════════════════════════════════════════════════════════
def brd_assembler_node(state: AgentState) -> AgentState:
    sections = state.get("brd_sections", {})
    extracted = state.get("brd_extracted", {})

    system = """Assemble a final BRD from drafted sections. Ensure consistency, remove duplication, fix requirement IDs.
Return ONLY valid JSON:
{
  "title": "BRD: [project]",
  "version": "1.0",
  "status": "Draft",
  "sections": {
    "executive_summary": "text",
    "business_objectives": "text",
    "scope": "text",
    "functional_requirements": "text",
    "non_functional_requirements": "text",
    "stakeholders_decisions": "text",
    "risks_constraints": "text",
    "feature_prioritization": "text",
    "timeline_milestones": "text"
  },
  "metadata": {"project_name":"","total_fr":0,"total_nfr":0,"high_priority":0}
}"""

    sections_text = "\n\n".join(f"=== {k} ===\n{v}" for k, v in sections.items())
    result = _llm(system, f"Sections:\n{sections_text[:6000]}")

    if isinstance(result, dict) and result:
        state["brd_final"] = result
    else:
        project_name = extracted.get("project_name", "Project")
        state["brd_final"] = {
            "title": f"BRD: {project_name}",
            "version": "1.0",
            "status": "Draft",
            "sections": {
                "executive_summary": sections.get("executive_summary", f"This BRD captures requirements for {project_name}."),
                "business_objectives": sections.get("business_objectives", "1. Deliver requested capabilities\n2. Improve process outcomes"),
                "scope": sections.get("scope", "In Scope:\n- Requested business functionality\n\nOut of Scope:\n- Unspecified features"),
                "functional_requirements": sections.get("functional_requirements", "FR-001 Core workflow\nDescription: Support requested process\nPriority: High"),
                "non_functional_requirements": sections.get("non_functional_requirements", "Reliability: Stable operation\nSecurity: Protect business data"),
                "stakeholders_decisions": sections.get("stakeholders_decisions", "Stakeholders: Requester and delivery team"),
                "risks_constraints": sections.get("risks_constraints", "Risk: Requirement ambiguity\nMitigation: Clarification checkpoints"),
                "feature_prioritization": sections.get("feature_prioritization", "P0: Core requested capabilities"),
                "timeline_milestones": sections.get("timeline_milestones", "Milestones: Draft -> Review -> Sign-off"),
            },
            "metadata": {"project_name": project_name, "total_fr": 1, "total_nfr": 1, "high_priority": 1},
        }
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
