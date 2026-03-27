"""
BRD Agent - Professional PDF Generator (Minimal-Safe Version)
==============================================================
Fixes "Not enough horizontal space to render a single character":
  - NO header()/footer() overrides
  - NO self.line() calls
  - NO multi_cell(0, ...) with w=0 — always uses explicit effective_width
  - All content written after add_page() where margins are guaranteed set
"""

from fpdf import FPDF
import datetime


def _safe(value, fallback=""):
    """Return a latin-1-safe string."""
    if value is None:
        return fallback
    s = str(value).encode("latin-1", errors="replace").decode("latin-1").strip()
    return s if s else fallback


class BRDPDFGenerator(FPDF):
    """Plain FPDF subclass — header() and footer() NOT overridden."""

    @property
    def _ew(self):
        """Effective page width (respects margins)."""
        return self.w - self.l_margin - self.r_margin

    # ── rendering helpers ────────────────────────────────────────────────────

    def _section(self, title):
        ew = self._ew
        self.set_font("Helvetica", "B", 12)
        self.set_fill_color(220, 230, 255)
        self.set_text_color(26, 31, 113)
        self.cell(ew, 9, _safe(title), 0, 1, "L", fill=True)
        self.set_text_color(30, 30, 30)
        self.ln(2)

    def _body(self, text):
        s = _safe(text)
        if not s:
            return
        ew = self._ew
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(ew, 7, s, 0, "L")

    def _sub(self, text):
        s = _safe(text)
        if not s:
            return
        ew = self._ew
        self.set_font("Helvetica", "I", 9)
        self.set_text_color(100, 100, 100)
        self.multi_cell(ew, 6, "     " + s, 0, "L")

    def _kv(self, key, value):
        ew = self._ew
        kw = min(50, ew * 0.35)
        self.set_font("Helvetica", "B", 10)
        self.set_text_color(60, 60, 60)
        self.cell(kw, 7, _safe(key) + ":", 0, 0, "L")
        self.set_font("Helvetica", "", 10)
        self.set_text_color(40, 40, 40)
        self.multi_cell(ew - kw, 7, _safe(value, "N/A"), 0, "L")

    # ── manually drawn header block ──────────────────────────────────────────

    def _draw_header(self):
        ew = self._ew
        self.set_font("Helvetica", "B", 13)
        self.set_text_color(26, 31, 113)
        self.cell(ew, 9, "BRD AGENT  -  PROFESSIONAL REQUIREMENTS REPORT", 0, 1, "C")

        self.set_font("Helvetica", "I", 8)
        self.set_text_color(100, 100, 150)
        ts = datetime.datetime.now().strftime("%Y-%m-%d %H:%M")
        self.cell(ew, 5, f"Generated: {ts}  |  Confidential", 0, 1, "R")
        self.ln(4)

        # reset colours
        self.set_text_color(30, 30, 30)

    # ── main builder ─────────────────────────────────────────────────────────

    def generate_report(self, brd_data, output_path=None, change_log=None):
        """
        output_path=None      -> returns bytes  (st.download_button)
        output_path="f.pdf"   -> saves to disk, returns path
        change_log            -> list of dicts with audit trail entries
        """
        LM, TM, RM = 15, 15, 15
        self.set_margins(left=LM, top=TM, right=RM)
        self.set_auto_page_break(auto=True, margin=15)
        self.add_page()

        # ── header ───────────────────────────────────────────────────────────
        self._draw_header()

        # ── project overview ─────────────────────────────────────────────────
        project = _safe(brd_data.get("project_topic"), "Unnamed Project")
        ew = self._ew
        self.set_font("Helvetica", "B", 14)
        self.set_text_color(26, 31, 113)
        self.multi_cell(ew, 11, f"Project: {project}", 0, "L")

        exec_sum = _safe(brd_data.get("execution_summary"))
        if exec_sum:
            self.set_font("Helvetica", "I", 10)
            self.set_text_color(80, 80, 80)
            self.multi_cell(ew, 7, exec_sum, 0, "L")

        try:
            health = int(brd_data.get("project_health_score", 100))
        except (TypeError, ValueError):
            health = 100
        hc = (0, 140, 0) if health > 70 else (180, 140, 0) if health > 40 else (180, 0, 0)
        self.ln(3)
        self.set_font("Helvetica", "B", 11)
        self.set_text_color(*hc)
        self.cell(ew, 9, f"Project Health Score: {health}%", 0, 1, "L")
        self.ln(5)

        # ── 1. Requirements ──────────────────────────────────────────────────
        self._section("1. Functional & Non-Functional Requirements")
        reqs = brd_data.get("requirements", [])
        if reqs:
            for req in reqs:
                if isinstance(req, dict):
                    rid   = _safe(req.get("id"),     "REQ")
                    rtext = _safe(req.get("text"),   "[no text]")
                    rtype = _safe(req.get("type"),   "Functional")
                    rsrc  = _safe(req.get("source"), "N/A")
                    rstat = _safe(req.get("status"), "Pending").capitalize()
                    self._body(f"[{rid}]  ({rtype})  {rtext}")
                    self._sub(f"Source: {rsrc}   Status: {rstat}")
                else:
                    self._body(f"- {_safe(req)}")
                self.ln(1)
        else:
            self._body("No requirements extracted.")
        self.ln(4)

        # ── 2. Stakeholders ──────────────────────────────────────────────────
        self._section("2. Stakeholder Analysis & Sentiment")
        stakeholders = brd_data.get("stakeholders", [])
        if stakeholders:
            for s in stakeholders:
                name      = _safe(s.get("name"),      "N/A")
                role      = _safe(s.get("role"),      "N/A")
                sentiment = _safe(s.get("sentiment"), "Neutral").upper()
                stance    = _safe(s.get("stance"),    "Neutral").capitalize()
                self._body(f"- {name}  |  Role: {role}  |  Sentiment: {sentiment}  |  Stance: {stance}")
        else:
            self._body("No stakeholders identified.")
        self.ln(4)

        # ── 3. Decisions ─────────────────────────────────────────────────────
        self._section("3. Key Decisions")
        decisions = brd_data.get("decisions", [])
        if decisions:
            for i, dec in enumerate(decisions, 1):
                if isinstance(dec, dict):
                    self._body(f"DEC-{i:03d}: {_safe(dec.get('text', dec))}")
                    if dec.get("source"):
                        self._sub(f"Source: {_safe(dec.get('source'))}")
                else:
                    self._body(f"DEC-{i:03d}: {_safe(dec)}")
                self.ln(1)
        else:
            self._body("No decisions extracted.")
        self.ln(4)

        # ── 4. Timeline ──────────────────────────────────────────────────────
        self._section("4. Project Timeline & Deadlines")
        timelines = brd_data.get("timelines", [])
        if timelines:
            for t in timelines:
                if isinstance(t, dict):
                    event    = _safe(t.get("milestone") or t.get("event"), "Event")
                    deadline = _safe(t.get("date")      or t.get("deadline"), "TBD")
                    self._body(f"- {event}:  {deadline}")
                else:
                    self._body(f"- {_safe(t)}")
        else:
            self._body("No timeline items found.")
        self.ln(4)

        # ── 5. Conflicts ─────────────────────────────────────────────────────
        conflicts = brd_data.get("conflicts", [])
        if conflicts:
            self._section("5. Conflict Alerts")
            self.set_text_color(160, 0, 0)
            for c in conflicts:
                if isinstance(c, dict):
                    desc     = _safe(c.get("description"), "No description")
                    severity = _safe(c.get("severity"),    "MED").upper()
                    self._body(f"[{severity}]  {desc}")
                else:
                    self._body(f"[ALERT]  {_safe(c)}")
            self.set_text_color(30, 30, 30)
            self.ln(4)

        # ── 6. Action Items ──────────────────────────────────────────────────
        self._section("6. Action Items")
        actions = brd_data.get("action_items", [])
        if actions:
            for act in actions:
                self._body(f"[ ]  {_safe(act)}")
        else:
            self._body("No action items identified.")
        self.ln(4)

        # ── 7. AI Noise Reduction ────────────────────────────────────────────
        noise = _safe(brd_data.get("noise_reduction_logic"))
        if noise:
            self._section("7. AI Noise Reduction Summary")
            self._body(noise)
            self.ln(4)

        # ── 8. Metadata ──────────────────────────────────────────────────────
        self._section("8. Traceability & Metadata")
        channel = _safe(brd_data.get("channel_type"), "Multi-Channel")
        try:
            conf_pct = f"{float(brd_data.get('confidence_score', 0)) * 100:.0f}%"
        except (TypeError, ValueError):
            conf_pct = "N/A"
        self._kv("Channel Type",     channel)
        self._kv("Confidence Score", conf_pct)
        self._kv("Report Date",      datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        self.ln(4)

        # ── 9. AI Refinement Reasoning (Explainability) ───────────────────────
        reasoning = _safe(brd_data.get("refinement_reasoning"))
        change_sum = _safe(brd_data.get("change_summary"))
        if reasoning or change_sum:
            self._section("9. AI Refinement Reasoning (Explainability)")
            if reasoning:
                self._kv("Why Changed", reasoning)
            if change_sum:
                self._kv("What Changed", change_sum)
            self.ln(4)

        # ── 10. Change Log & Audit Trail ──────────────────────────────────────
        if change_log:
            self._section("10. Change Log & Audit Trail")
            for idx, entry in enumerate(change_log, 1):
                self.set_font("Helvetica", "B", 10)
                self.set_text_color(26, 31, 113)
                ew = self._ew
                self.cell(ew, 7, f"Change #{idx}  |  {_safe(entry.get('timestamp', ''))}", 0, 1, "L")
                self.set_text_color(40, 40, 40)

                self._kv("Instruction",  _safe(entry.get("instruction"), "N/A"))
                self._kv("AI Reasoning", _safe(entry.get("reasoning"),   "N/A"))
                self._kv("Summary",      _safe(entry.get("summary"),     "N/A"))
                self.ln(3)

        # ── page number (manual, safe) ────────────────────────────────────────
        self.ln(8)
        ew = self._ew
        self.set_font("Helvetica", "I", 8)
        self.set_text_color(150, 150, 150)
        self.cell(ew, 6, f"Page {self.page_no()}  |  Confidential  |  BRD Agent AI Analyst", 0, 1, "C")

        if output_path:
            self.output(output_path)
            return output_path
        else:
            # fpdf2 v2.x: output() returns bytearray (dest='S' is deprecated)
            return bytes(self.output())


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def export_brd_to_premium_pdf(brd_data, filename="BRD_Report.pdf", change_log=None):
    """Save PDF to disk. Returns file path."""
    pdf = BRDPDFGenerator()
    return pdf.generate_report(brd_data, output_path=filename, change_log=change_log)


def generate_brd_pdf_bytes(brd_data, change_log=None):
    """Return PDF as raw bytes — for st.download_button."""
    pdf = BRDPDFGenerator()
    return pdf.generate_report(brd_data, output_path=None, change_log=change_log)
