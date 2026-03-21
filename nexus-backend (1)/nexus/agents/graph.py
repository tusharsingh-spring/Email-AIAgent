"""
NEXUS — LangGraph Multi-Agent Orchestrator
Agents: Email Watcher → Intent Router → BRD Agent → Calendar Agent → Reply Composer
"""

import os, json, asyncio
from typing import TypedDict, Annotated, Literal
from langgraph.graph import StateGraph, END
from langgraph.checkpoint.memory import MemorySaver
from groq import Groq

groq = Groq(api_key=os.getenv("GROQ_API_KEY"))
MODEL = "llama-3.1-70b-versatile"


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

    # Intent parsing
    intent:          str             # email | schedule | cancel | status | brd | escalate | general
    urgency_score:   int
    sentiment:       str
    entities:        dict

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


def _llm(system: str, user: str) -> dict | str:
    import re
    resp = groq.chat.completions.create(
        model=MODEL,
        messages=[{"role":"system","content":system},{"role":"user","content":user}],
        temperature=0.1, max_tokens=2000,
    )
    raw = resp.choices[0].message.content.strip()
    raw = re.sub(r"```json\n?|\n?```", "", raw).strip()
    try:    return json.loads(raw)
    except: return raw


# ══════════════════════════════════════════════════════════════
# NODE 1 — Intent Router
# Decides which downstream agent handles this email
# ══════════════════════════════════════════════════════════════
def intent_router_node(state: AgentState) -> AgentState:
    system = """Classify this email and extract entities. Return ONLY valid JSON:
{
  "intent": "schedule|cancel|update|status|brd|escalate|general",
  "urgency_score": 0-100,
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
- intent=brd if email contains: 'requirements document', 'BRD', 'business requirements', 'spec document', 'write up requirements', 'document the project'
- intent=escalate if urgency_score > 70 OR sentiment = frustrated/urgent
- intent=schedule if any meeting/call/sync requested
- intent=status if asking for update/progress
"""
    result = _llm(system, f"From: {state['sender']}\nSubject: {state['subject']}\n\nBody:\n{state['body'][:2000]}")

    if isinstance(result, dict):
        state["intent"]        = result.get("intent", "general")
        state["urgency_score"] = result.get("urgency_score", 0)
        state["sentiment"]     = result.get("sentiment", "neutral")
        state["entities"]      = result.get("entities", {})
        state["participants"]  = result.get("participants", [state["sender"]])
        state["proposed_slots"]= result.get("proposed_slots", [])
        state["meeting_title"] = result.get("meeting_title") or state["subject"]
        state["needs_human"]   = result.get("urgency_score", 0) > 70

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
    if isinstance(result, dict):
        state["brd_extracted"] = result
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

    if isinstance(result, dict):
        state["brd_final"] = result
    return state


# ══════════════════════════════════════════════════════════════
# NODE 6 — Calendar Agent
# Uses real Google Calendar freebusy API
# ══════════════════════════════════════════════════════════════
def calendar_agent_node(state: AgentState) -> AgentState:
    from services.calendar_service import find_free_slot, create_event
    from services.google_auth import load_credentials
    from datetime import datetime
    import dateparser

    creds = load_credentials()
    if not creds:
        state["error"] = "Google not authenticated"
        return state

    # Normalize proposed slots to datetime
    participants = state.get("participants", [])
    duration     = 30  # default

    # Try to find slot from proposed times first
    preferred = None
    for slot in state.get("proposed_slots", []):
        raw = slot.get("date_raw", "")
        parsed = dateparser.parse(raw, settings={"PREFER_DATES_FROM":"future"})
        if parsed:
            preferred = parsed
            break

    free_slot = find_free_slot(creds, participants,
                               duration_minutes=duration,
                               preferred_start=preferred)

    if free_slot:
        state["free_slot"] = free_slot.isoformat()
        # Create the real calendar event
        event = create_event(
            creds,
            title=state.get("meeting_title", state.get("subject", "Meeting")),
            start=free_slot,
            duration_minutes=duration,
            attendees=participants
        )
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
def route_intent(state: AgentState) -> Literal["brd_extract","calendar","escalate","compose"]:
    intent = state.get("intent", "general")
    if state.get("urgency_score", 0) > 70 or intent == "escalate":
        return "escalate"
    if intent == "brd":
        return "brd_extract"
    if intent in ("schedule", "cancel", "update"):
        return "calendar"
    return "compose"

def route_after_brd_gaps(state: AgentState) -> Literal["brd_write","escalate"]:
    gaps = state.get("brd_gaps", {})
    if not gaps.get("can_proceed", True) and state.get("urgency_score", 0) < 70:
        return "escalate"  # needs human clarification
    return "brd_write"

def route_after_calendar(state: AgentState) -> Literal["compose","escalate"]:
    if state.get("error"):
        return "escalate"
    return "compose"

def route_final(state: AgentState) -> Literal["end","escalate"]:
    if state.get("needs_human"):
        return "escalate"
    return "end"


# ══════════════════════════════════════════════════════════════
# BUILD THE LANGGRAPH
# ══════════════════════════════════════════════════════════════
def build_graph():
    builder = StateGraph(AgentState)

    # Add nodes
    builder.add_node("intent_router",    intent_router_node)
    builder.add_node("brd_extract",      brd_extraction_node)
    builder.add_node("brd_gaps",         brd_gap_node)
    builder.add_node("brd_write",        brd_writer_node)
    builder.add_node("brd_assemble",     brd_assembler_node)
    builder.add_node("calendar",         calendar_agent_node)
    builder.add_node("compose",          reply_composer_node)
    builder.add_node("escalate",         escalation_node)

    # Entry point
    builder.set_entry_point("intent_router")

    # Routing from intent
    builder.add_conditional_edges("intent_router", route_intent, {
        "brd_extract": "brd_extract",
        "calendar":    "calendar",
        "escalate":    "escalate",
        "compose":     "compose",
    })

    # BRD pipeline
    builder.add_edge("brd_extract", "brd_gaps")
    builder.add_conditional_edges("brd_gaps", route_after_brd_gaps, {
        "brd_write":  "brd_write",
        "escalate":   "escalate",
    })
    builder.add_edge("brd_write",   "brd_assemble")
    builder.add_edge("brd_assemble","compose")

    # Calendar pipeline
    builder.add_conditional_edges("calendar", route_after_calendar, {
        "compose":  "compose",
        "escalate": "escalate",
    })

    # Final routing
    builder.add_conditional_edges("compose", route_final, {
        "end":      END,
        "escalate": "escalate",
    })
    builder.add_edge("escalate", END)

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
