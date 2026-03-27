"""
BRD Agent - Data Ingestion Module (Module 1)
=============================================
Handles loading, preprocessing, and chunking data from multiple sources.

SUPPORTED DATASETS:
  📧 Enron Email Dataset   - CSV from Kaggle (Public Domain)
  🎙️ AMI Meeting Corpus    - HuggingFace datasets (CC BY 4.0)
  📝 Meeting Transcripts   - CSV from Kaggle

FEATURES:
  - Multi-format parsing (emails, transcripts, chats)
  - Noise filtering via regex + keyword matching
  - Sliding window chunking for LLM input
  - Synthetic chat generation from email threads
  - Entity extraction (dates, names) from headers

HOW TO USE:
  from brd_agent.data_ingest import DataIngestionEngine
  engine = DataIngestionEngine()
  emails = engine.load_enron("path/to/emails.csv")
  ami = engine.load_ami()  # auto-downloads from HuggingFace
  processed = engine.preprocess_noise(raw_text)
  chunks = engine.chunk_text(long_text)
"""

import re
import os
import json
import random
import datetime
import hashlib
from pathlib import Path
from typing import List, Dict, Optional, Tuple

from brd_agent.config import (
    ENRON_DIR, AMI_DIR, MEETING_TRANSCRIPTS_DIR,
    RELEVANCE_KEYWORDS, NOISE_KEYWORDS,
    CHUNK_SIZE, CHUNK_OVERLAP, DATASET_SOURCES
)

# ============================================================================
# DATA INGESTION ENGINE
# ============================================================================

class DataIngestionEngine:
    """
    Main class for loading and preprocessing data from all sources.

    ARCHITECTURE:
        Raw Data ──→ Parse ──→ Clean ──→ Filter Noise ──→ Chunk ──→ Store in DB

    EXAMPLE:
        engine = DataIngestionEngine()
        data = engine.load_enron("emails.csv")
        for item in data:
            cleaned = engine.preprocess_noise(item["content"])
            chunks = engine.chunk_text(cleaned)
    """

    def __init__(self):
        """Initialize the ingestion engine."""
        self.stats = {
            "total_loaded": 0,
            "total_filtered": 0,
            "total_chunks": 0
        }

    # ────────────────────────────────────────────────────────────────────
    # SECTION 1: ENRON EMAIL LOADING
    # ────────────────────────────────────────────────────────────────────

    def load_enron(self, csv_path: str = None, max_rows: int = 1000) -> List[Dict]:
        """
        Load and parse Enron email dataset from CSV.

        The Enron dataset has a 'message' column containing full email text
        including headers (From, To, CC, BCC, Subject, Date, Body).

        PARAMS:
            csv_path:  Path to the Enron CSV file (emails.csv from Kaggle)
            max_rows:  Maximum number of emails to load (limit for hackathon)

        RETURNS:
            List of dicts with keys: type, content, subject, sender,
            recipients, timestamp, source_dataset

        FILE FORMAT (Kaggle Enron CSV):
            Column 'file': path within the Enron corpus
            Column 'message': full email text with headers
        """
        try:
            import pandas as pd
        except ImportError:
            print("❌ pandas not installed. Run: pip install pandas")
            return []

        # Use provided path or look in default directory
        if csv_path is None:
            csv_path = str(ENRON_DIR / "emails.csv")

        if not os.path.exists(csv_path):
            print(f"⚠️ Enron dataset not found at: {csv_path}")
            print(f"   Download from: {DATASET_SOURCES['enron']['url']}")
            print(f"   Place emails.csv in: {ENRON_DIR}")
            return self._generate_sample_emails()

        print(f"📧 Loading Enron emails from: {csv_path}")
        df = pd.read_csv(csv_path, nrows=max_rows)

        parsed_emails = []
        for idx, row in df.iterrows():
            try:
                email_data = self._parse_email_text(row.get("message", ""))
                if email_data:
                    email_data["source_dataset"] = "enron"
                    email_data["source_url"] = DATASET_SOURCES["enron"]["url"]
                    parsed_emails.append(email_data)
            except Exception as e:
                continue  # Skip malformed emails

        self.stats["total_loaded"] += len(parsed_emails)
        print(f"   ✅ Loaded {len(parsed_emails)} emails")
        return parsed_emails

    def _parse_email_text(self, raw_text: str) -> Optional[Dict]:
        """
        Parse a raw email string into structured fields.

        Extracts From, To, CC, BCC, Subject, Date, and Body
        from the raw email text format used in the Enron dataset.
        """
        if not raw_text or len(raw_text.strip()) < 10:
            return None

        result = {
            "type": "email",
            "content": "",
            "subject": "",
            "sender": "",
            "recipients": [],
            "timestamp": None
        }

        # Split headers from body (headers end at first blank line)
        parts = raw_text.split("\n\n", 1)
        headers_text = parts[0] if parts else ""
        body_text = parts[1] if len(parts) > 1 else ""

        # Parse headers using regex
        # From:
        from_match = re.search(r'^From:\s*(.+)$', headers_text, re.MULTILINE | re.IGNORECASE)
        if from_match:
            result["sender"] = from_match.group(1).strip()

        # To:
        to_match = re.search(r'^To:\s*(.+?)(?=\n\S|\Z)', headers_text,
                             re.MULTILINE | re.IGNORECASE | re.DOTALL)
        if to_match:
            recipients = [r.strip() for r in to_match.group(1).split(",")]
            result["recipients"].extend(recipients)

        # CC:
        cc_match = re.search(r'^Cc:\s*(.+?)(?=\n\S|\Z)', headers_text,
                             re.MULTILINE | re.IGNORECASE | re.DOTALL)
        if cc_match:
            cc_list = [r.strip() for r in cc_match.group(1).split(",")]
            result["recipients"].extend(cc_list)

        # Subject:
        subj_match = re.search(r'^Subject:\s*(.+)$', headers_text, re.MULTILINE | re.IGNORECASE)
        if subj_match:
            result["subject"] = subj_match.group(1).strip()

        # Date:
        date_match = re.search(r'^Date:\s*(.+)$', headers_text, re.MULTILINE | re.IGNORECASE)
        if date_match:
            result["timestamp"] = date_match.group(1).strip()

        # Body
        result["content"] = body_text.strip() if body_text else headers_text.strip()

        # Clean up recipients list
        result["recipients"] = [r for r in result["recipients"] if r and "@" in r]

        return result if result["content"] else None

    def _generate_sample_emails(self) -> List[Dict]:
        """Generate realistic sample emails when dataset is not available."""
        print("   📝 Generating sample emails for demo...")

        samples = [
            {
                "type": "email",
                "subject": "RE: Q2 Platform Migration Requirements",
                "sender": "jennifer.wu@techcorp.com",
                "recipients": ["dev-team@techcorp.com", "pm@techcorp.com"],
                "content": """Team,

Following up on the platform migration discussion. Here are the confirmed requirements:

FUNCTIONAL REQUIREMENTS:
1. All user data must be migrated with zero data loss - this is non-negotiable
2. The new platform must support SSO via SAML 2.0 and OAuth 2.0
3. API backward compatibility must be maintained for at least 6 months
4. Real-time data synchronization between old and new systems during transition

NON-FUNCTIONAL REQUIREMENTS:
- System uptime: 99.95% SLA during migration period
- Page load time: < 2 seconds for 90th percentile
- Support for 10,000 concurrent users (up from current 5,000)

TIMELINE:
- Phase 1 (Data Migration): Complete by March 30, 2026
- Phase 2 (API Migration): Complete by April 30, 2026
- Phase 3 (Full Cutover): Target May 15, 2026

STAKEHOLDERS:
- Executive Sponsor: VP of Engineering (Mark Thompson)
- Product Owner: Jennifer Wu
- Tech Lead: Raj Patel
- QA Lead: Lisa Chen

RISK: The vendor contract for the legacy system expires June 1. No extension possible.

Decision from yesterday's meeting: We'll use a blue-green deployment strategy.

Please review and flag any blockers by EOD Friday.

Thanks,
Jennifer""",
                "source_dataset": "sample",
                "timestamp": "2026-02-10"
            },
            {
                "type": "email",
                "subject": "Project Omega - Security Audit Findings",
                "sender": "security@techcorp.com",
                "recipients": ["cto@techcorp.com", "dev-leads@techcorp.com"],
                "content": """Dear Leadership Team,

The security audit for Project Omega has been completed. Key findings that affect requirements:

CRITICAL FINDINGS (Must fix before launch):
1. SQL injection vulnerability in the search API - Requirement: Implement parameterized queries
2. Missing rate limiting on authentication endpoints - Requirement: Add rate limiting (max 100 req/min)
3. Sensitive data stored in plaintext - Requirement: Encrypt at rest using AES-256

HIGH PRIORITY:
4. No CSRF protection on form submissions - Timeline: Fix by Feb 28
5. API keys exposed in client-side code - Timeline: Move to server-side by March 5

STAKEHOLDER FEEDBACK:
- CTO: "Critical items are launch blockers. No exceptions."
- Legal: "GDPR compliance is mandatory. Data encryption is not optional."
- Product: "Can we phase the high-priority items post-launch?" 
- Security Lead: "I disagree with Product's suggestion - all items should be pre-launch."

This represents a CONFLICT between Product and Security priorities. 
Escalation meeting scheduled for Feb 20.

Decision Needed: Budget approval for 2 additional security engineers ($50K/month).

Regards,
Security Team""",
                "source_dataset": "sample",
                "timestamp": "2026-02-12"
            },
            {
                "type": "email",
                "subject": "RE: Customer Portal - Phase 2 Scope",
                "sender": "product@startup.io",
                "recipients": ["engineering@startup.io"],
                "content": """Hi Engineering,

Based on customer interviews and stakeholder feedback, here's the Phase 2 scope:

USER STORIES:
- As a customer, I want to view my order history so I can track past purchases
- As an admin, I want to generate reports so I can analyze business metrics
- As a customer, I want to receive email notifications for order status changes

ACCEPTANCE CRITERIA:
1. Order history page loads within 1.5 seconds
2. Reports can be exported in CSV and PDF formats
3. Email notifications sent within 30 seconds of status change

DEPENDENCIES:
- Requires completion of Phase 1 authentication module
- Needs integration with third-party email service (SendGrid)

TIMELINE:
- Sprint 1 (Feb 24 - Mar 7): Order history backend + frontend
- Sprint 2 (Mar 10 - Mar 21): Reporting engine
- Sprint 3 (Mar 24 - Apr 4): Notifications + testing

BUDGET: Approved $25,000 for external API integrations

Let me know if any of these requirements need clarification.

Best,
Product Team""",
                "source_dataset": "sample",
                "timestamp": "2026-02-15"
            }
        ]

        self.stats["total_loaded"] += len(samples)
        return samples

    # ────────────────────────────────────────────────────────────────────
    # SECTION 2: AMI MEETING CORPUS LOADING
    # ────────────────────────────────────────────────────────────────────

    def load_ami(self, max_samples: int = 100) -> List[Dict]:
        """
        Load AMI Meeting Corpus from HuggingFace.

        The AMI corpus contains meeting transcripts with human-written summaries.
        We use the summaries as ground truth for validating our extraction accuracy.

        PARAMS:
            max_samples: Maximum number of meetings to load

        RETURNS:
            List of dicts with transcript and summary data
        """
        try:
            from datasets import load_dataset
            print("🎙️ Loading AMI Meeting Corpus from HuggingFace...")

            dataset = load_dataset("knkarthick/AMI", split="train")

            meetings = []
            for i, item in enumerate(dataset):
                if i >= max_samples:
                    break

                meeting = {
                    "type": "meeting",
                    "content": item.get("dialogue", ""),
                    "subject": f"AMI Meeting #{i+1}",
                    "sender": "meeting_participants",
                    "recipients": [],
                    "source_dataset": "ami",
                    "source_url": DATASET_SOURCES["ami"]["url"],
                    "timestamp": None,
                    # Ground truth summary for validation
                    "ground_truth_summary": item.get("summary", "")
                }
                meetings.append(meeting)

            self.stats["total_loaded"] += len(meetings)
            print(f"   ✅ Loaded {len(meetings)} meeting transcripts")
            return meetings

        except ImportError:
            print("❌ 'datasets' library not installed. Run: pip install datasets")
            return self._generate_sample_meetings()
        except Exception as e:
            print(f"⚠️ Could not load AMI dataset: {e}")
            return self._generate_sample_meetings()

    def _generate_sample_meetings(self) -> List[Dict]:
        """Generate sample meeting transcripts when AMI dataset is not available."""
        print("   📝 Generating sample meeting transcripts for demo...")

        samples = [
            {
                "type": "meeting",
                "subject": "Product Roadmap Review - Q2 2026",
                "sender": "meeting_participants",
                "recipients": [],
                "content": """Facilitator: Welcome everyone to the Q2 roadmap review. Let's go through each feature.

PM (Sarah): The top priority is the mobile app redesign. User research shows 67% of our users access the platform via mobile, but our mobile NPS is only 23.

Engineer (Tom): The redesign requires a complete rewrite of the navigation component. I estimate 4 weeks for the frontend, plus 2 weeks for API optimization.

Designer (Maya): I have the new wireframes ready. Key change: we're moving from a hamburger menu to a bottom tab navigation. User testing showed 40% faster task completion.

PM (Sarah): Great. Second priority is the analytics dashboard. Stakeholder requirement from the CEO.

Engineer (Tom): We need to decide on the charting library. I recommend Plotly for interactive charts, but it adds 200KB to the bundle.

QA (James): I want to raise a concern. We still have 15 open bugs from Q1. The requirement was to close all P1 bugs before new feature work.

PM (Sarah): Valid point. Decision: We'll allocate the first week of Q2 exclusively to bug fixes. Tom, can you prioritize?

Engineer (Tom): Sure. But I need clarity on the performance requirement - what's the target page load time?

PM (Sarah): Stakeholder requirement: under 3 seconds on 3G networks. 

Engineer (Tom): That's aggressive with the current architecture. We might need to implement lazy loading and code splitting.

Designer (Maya): Timeline concern - the design hand-off for the analytics dashboard won't be ready until March 15.

PM (Sarah): Noted. Let's adjust the timeline. Analytics dashboard moves to Sprint 3 instead of Sprint 2.

Facilitator: Any other items? Good. Action items: Tom - bug priority list by Friday, Maya - wireframe review session Monday, James - updated test plan by next Wednesday.""",
                "source_dataset": "sample",
                "ground_truth_summary": "The team reviewed Q2 priorities: mobile app redesign (top priority due to 67% mobile usage), analytics dashboard (CEO requirement), and Q1 bug fixes. Key decisions: bottom tab navigation for mobile, first week dedicated to bugs, analytics moved to Sprint 3. Performance target: under 3 seconds on 3G."
            },
            {
                "type": "meeting",
                "subject": "Sprint Retrospective - Data Pipeline Project",
                "sender": "meeting_participants",
                "recipients": [],
                "content": """Scrum Master: Let's start the retro. What went well?

Dev A (Priya): The new data pipeline processed 2 million records in 3 hours, meeting the performance requirement.

Dev B (Alex): The automated testing caught a critical bug in the transformation layer before it hit production.

Scrum Master: What didn't go well?

Dev A (Priya): The requirement to support real-time streaming was added mid-sprint. This caused scope creep and we couldn't finish the batch processing optimization.

Product Owner (Nina): I take responsibility for that. The client escalated and we had to accommodate.

Dev B (Alex): The documentation requirement wasn't met. We need to document all API endpoints before the integration team can use them.

Scrum Master: What should we improve?

Product Owner (Nina): Decision: No mid-sprint requirement changes unless it's a P0 production issue.

Dev A (Priya): We need a dedicated DevOps engineer. Setting up the Kubernetes cluster took 2 days of developer time.

Dev B (Alex): Agreed. Also, the code review process is a bottleneck. Requirement: all PRs must be reviewed within 4 hours during business hours.

Product Owner (Nina): I'll discuss the DevOps hire with management. Timeline: proposal by end of month.

Scrum Master: Stakeholder feedback from the client: they're happy with the throughput but concerned about data freshness. The requirement is data no older than 15 minutes.

Dev A (Priya): That changes our architecture significantly. We'd need to move from batch to stream processing for critical data feeds.

Product Owner (Nina): Let's scope that for next sprint. Priya, can you do a technical spike?

Dev A (Priya): Yes, I'll have a proposal by Wednesday.""",
                "source_dataset": "sample",
                "ground_truth_summary": "Sprint retro covered: successful data pipeline (2M records/3hrs), mid-sprint scope creep issue, documentation gaps. Decisions: no mid-sprint changes except P0s, PR review within 4 hours, DevOps hire proposal by month-end. New requirement: data freshness under 15 minutes requires architecture change from batch to stream processing."
            }
        ]

        self.stats["total_loaded"] += len(samples)
        return samples

    # ────────────────────────────────────────────────────────────────────
    # SECTION 3: MEETING TRANSCRIPTS DATASET
    # ────────────────────────────────────────────────────────────────────

    def load_meeting_transcripts(self, csv_path: str = None, max_rows: int = 500) -> List[Dict]:
        """
        Load meeting transcripts from Kaggle dataset (CSV format).

        PARAMS:
            csv_path:  Path to the meeting transcripts CSV
            max_rows:  Maximum number of transcripts to load

        RETURNS:
            List of dicts with transcript data
        """
        try:
            import pandas as pd
        except ImportError:
            print("❌ pandas not installed. Run: pip install pandas")
            return []

        if csv_path is None:
            csv_path = str(MEETING_TRANSCRIPTS_DIR / "meeting_transcripts.csv")

        if not os.path.exists(csv_path):
            print(f"⚠️ Meeting transcripts not found at: {csv_path}")
            print(f"   Download from: {DATASET_SOURCES['meeting_transcripts']['url']}")
            return []

        print(f"📝 Loading meeting transcripts from: {csv_path}")
        df = pd.read_csv(csv_path, nrows=max_rows)

        transcripts = []
        for idx, row in df.iterrows():
            content = ""
            # Try common column names
            for col in ["transcript", "text", "content", "dialogue", "conversation"]:
                if col in df.columns:
                    content = str(row[col])
                    break

            if not content or len(content) < 20:
                continue

            transcript = {
                "type": "meeting",
                "content": content,
                "subject": row.get("title", row.get("topic", f"Meeting #{idx+1}")),
                "sender": "meeting_participants",
                "recipients": [],
                "source_dataset": "meeting_transcripts",
                "source_url": DATASET_SOURCES["meeting_transcripts"]["url"],
                "timestamp": row.get("date", None)
            }
            transcripts.append(transcript)

        self.stats["total_loaded"] += len(transcripts)
        print(f"   ✅ Loaded {len(transcripts)} transcripts")
        return transcripts

    # ────────────────────────────────────────────────────────────────────
    # SECTION 4: SYNTHETIC CHAT GENERATION
    # ────────────────────────────────────────────────────────────────────

    def generate_synthetic_chats(self, emails: List[Dict], num_chats: int = 50) -> List[Dict]:
        """
        Convert email threads into Slack-style chat messages.

        This creates synthetic chat data from emails to simulate multi-channel input.
        Makes the app more realistic by having all three communication types.

        ALGORITHM:
          1. Take email content
          2. Split into paragraphs (simulate separate messages)
          3. Assign random usernames (from email addresses)
          4. Add timestamps (spread across a realistic time window)
          5. Format as Slack-style JSON

        PARAMS:
            emails:    List of email dicts from load_enron()
            num_chats: Number of synthetic chats to generate

        RETURNS:
            List of chat dicts formatted as Slack messages
        """
        print(f"💬 Generating {num_chats} synthetic chat messages from emails...")

        # Pool of realistic usernames
        usernames = [
            "alex.dev", "sarah.pm", "mike.eng", "lisa.qa",
            "raj.backend", "jen.frontend", "tom.devops", "maya.design",
            "chris.data", "nina.product", "dave.security", "kate.ux"
        ]

        channels = [
            "#project-alpha", "#team-backend", "#requirements",
            "#sprint-planning", "#general-dev", "#code-review"
        ]

        chats = []
        for i, email in enumerate(emails[:num_chats]):
            content = email.get("content", "")
            if not content:
                continue

            # Split content into chat-like messages
            paragraphs = [p.strip() for p in content.split("\n") if p.strip() and len(p.strip()) > 10]

            if not paragraphs:
                continue

            # Build a Slack-style conversation
            channel = random.choice(channels)
            base_time = datetime.datetime(2026, 2, random.randint(1, 28),
                                         random.randint(9, 17),
                                         random.randint(0, 59))

            chat_messages = []
            for j, paragraph in enumerate(paragraphs[:10]):  # Max 10 messages per chat
                user = random.choice(usernames)
                msg_time = base_time + datetime.timedelta(minutes=j * random.randint(1, 5))
                time_str = msg_time.strftime("%Y-%m-%d %H:%M")
                chat_messages.append(f"[{time_str}] @{user}: {paragraph}")

            chat_content = f"{channel} - Chat Export\n" + "\n".join(chat_messages)

            chat = {
                "type": "chat",
                "content": chat_content,
                "subject": f"{channel} - Discussion #{i+1}",
                "sender": random.choice(usernames),
                "recipients": random.sample(usernames, min(4, len(usernames))),
                "source_dataset": "synthetic",
                "source_url": "Generated from Enron email data",
                "timestamp": base_time.isoformat()
            }
            chats.append(chat)

        self.stats["total_loaded"] += len(chats)
        print(f"   ✅ Generated {len(chats)} synthetic chats")
        return chats

    # ────────────────────────────────────────────────────────────────────
    # SECTION 5: NOISE FILTERING & PREPROCESSING
    # ────────────────────────────────────────────────────────────────────

    def preprocess_noise(self, text: str) -> Tuple[str, float, bool]:
        """
        Filter irrelevant content from text using keyword matching + regex.

        ALGORITHM:
          1. Check for noise keywords (lunch, newsletter, etc.)
          2. Check for relevance keywords (requirement, deadline, etc.)
          3. Calculate noise score based on ratio
          4. Remove common noise patterns (signatures, disclaimers)
          5. Return cleaned text with noise score

        PARAMS:
            text: Raw input text to filter

        RETURNS:
            Tuple of (cleaned_text, noise_score, is_noise)
              - cleaned_text: Text with noise removed
              - noise_score:  0.0 (fully relevant) to 1.0 (pure noise)
              - is_noise:     True if text is mostly noise

        EXAMPLE:
            cleaned, score, is_noise = engine.preprocess_noise("Let's discuss lunch plans...")
            # score ≈ 0.9, is_noise = True
        """
        if not text:
            return "", 1.0, True

        text_lower = text.lower()

        # Count relevance and noise keyword hits
        relevance_hits = sum(1 for kw in RELEVANCE_KEYWORDS if kw in text_lower)
        noise_hits = sum(1 for kw in NOISE_KEYWORDS if kw in text_lower)

        # Calculate noise score
        total_hits = relevance_hits + noise_hits
        if total_hits == 0:
            noise_score = 0.5  # Neutral if no keywords found
        else:
            noise_score = noise_hits / total_hits

        is_noise = noise_score > 0.6

        # Clean the text even if not noise (remove signatures, etc.)
        cleaned = self._clean_text(text)

        self.stats["total_filtered"] += 1 if is_noise else 0
        return cleaned, noise_score, is_noise

    def _clean_text(self, text: str) -> str:
        """
        Clean text by removing common noise patterns.

        Removes:
          - Email signatures (lines starting with --)
          - Disclaimers
          - Excessive whitespace
          - Forwarded message headers
          - Quoted reply markers (> lines)
        """
        lines = text.split("\n")
        cleaned_lines = []
        in_signature = False

        for line in lines:
            stripped = line.strip()

            # Detect start of email signature
            if stripped in ["--", "---", "____", "====", "Best,", "Thanks,",
                           "Regards,", "Cheers,", "Best regards,"]:
                in_signature = True
                continue

            if in_signature:
                # Keep going until we find another content section
                if stripped.startswith(("From:", "Subject:", "Date:", "---")):
                    in_signature = False
                else:
                    continue

            # Skip forwarded headers
            if re.match(r'^(>|\|)\s*', stripped):
                continue

            # Skip disclaimer patterns
            if re.match(r'^(CONFIDENTIAL|DISCLAIMER|This email)', stripped, re.IGNORECASE):
                continue

            # Skip empty lines (consolidate multiple blank lines)
            if not stripped and cleaned_lines and not cleaned_lines[-1].strip():
                continue

            cleaned_lines.append(line)

        result = "\n".join(cleaned_lines).strip()

        # Normalize whitespace
        result = re.sub(r'\n{3,}', '\n\n', result)
        result = re.sub(r' {2,}', ' ', result)

        return result

    # ────────────────────────────────────────────────────────────────────
    # SECTION 6: TEXT CHUNKING
    # ────────────────────────────────────────────────────────────────────

    def chunk_text(self, text: str, chunk_size: int = None,
                   overlap: int = None) -> List[str]:
        """
        Split long text into manageable chunks for LLM processing.

        Uses a sliding window approach to preserve context between chunks.

        ALGORITHM:
          1. Split text into words
          2. Create chunks of chunk_size words
          3. Each chunk overlaps with the previous by overlap words
          4. This preserves context at chunk boundaries

        PARAMS:
            text:       Input text to chunk
            chunk_size: Words per chunk (default: from config.CHUNK_SIZE)
            overlap:    Words of overlap between chunks (default: from config)

        RETURNS:
            List of text chunks

        EXAMPLE:
            chunks = engine.chunk_text(very_long_email, chunk_size=512, overlap=50)
            for chunk in chunks:
                result = llm_extract(chunk)
        """
        if not text:
            return []

        chunk_size = chunk_size or CHUNK_SIZE
        overlap = overlap or CHUNK_OVERLAP

        # Prevent non-progressing windows when overlap is too large.
        if chunk_size <= 0:
            return [text]
        overlap = max(0, min(overlap, chunk_size - 1))

        words = text.split()
        total_words = len(words)

        # If text fits in one chunk, return as-is
        if total_words <= chunk_size:
            return [text]

        chunks = []
        start = 0

        while start < total_words:
            end = min(start + chunk_size, total_words)
            chunk = " ".join(words[start:end])
            chunks.append(chunk)

            if end >= total_words:
                break

            # Move start forward, minus overlap
            next_start = end - overlap
            if next_start <= start:
                next_start = start + 1
            start = next_start
            if start >= total_words:
                break

        self.stats["total_chunks"] += len(chunks)
        return chunks

    # ────────────────────────────────────────────────────────────────────
    # SECTION 7: ENTITY EXTRACTION FROM METADATA
    # ────────────────────────────────────────────────────────────────────

    def extract_entities(self, text: str) -> Dict:
        """
        Extract named entities from text using regex patterns.

        Extracts:
          - Dates/Timelines (various formats)
          - Email addresses
          - People names (from email headers)
          - Action items (lines starting with "- Name:")
          - Requirements (lines with "must", "shall", "should")

        PARAMS:
            text: Input text to extract entities from

        RETURNS:
            Dict with keys: dates, emails, people, action_items, requirements
        """
        entities = {
            "dates": [],
            "emails": [],
            "people": [],
            "action_items": [],
            "requirements": []
        }

        # ── Extract dates ──
        # Matches: March 15, 2026 | 03/15/2026 | 2026-03-15 | Feb 20 | Q2 2026
        date_patterns = [
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s*\d{4})?\b',
            r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s*\d{4})?\b',
            r'\b\d{1,2}/\d{1,2}/\d{2,4}\b',
            r'\b\d{4}-\d{2}-\d{2}\b',
            r'\bQ[1-4]\s*\d{4}\b',
            r'\b(?:end of|by end of)\s+(?:week|month|quarter|year|sprint|day)\b',
            r'\b(?:EOD|EOW|EOM)\b'
        ]
        for pattern in date_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            entities["dates"].extend(matches)

        # ── Extract emails ──
        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        email_matches = re.findall(email_pattern, text)
        # Safe deduplication for emails
        entities["emails"] = list(set(email_matches))  # Emails are always strings

        # ── Extract action items ──
        # Lines that look like "- Name: action" or "Action item: ..."
        action_patterns = [
            r'[-•]\s*(\w+):\s*(.+)',
            r'(?:Action item|TODO|Task):\s*(.+)',
        ]
        for pattern in action_patterns:
            matches = re.findall(pattern, text, re.MULTILINE | re.IGNORECASE)
            for match in matches:
                if isinstance(match, tuple):
                    entities["action_items"].append(" - ".join(match))
                else:
                    entities["action_items"].append(match)

        # ── Extract requirement-like sentences ──
        req_pattern = r'(?:^|\. )([^.]*?(?:must|shall|should|need to|required to|requirement)[^.]*\.)'
        req_matches = re.findall(req_pattern, text, re.MULTILINE | re.IGNORECASE)
        entities["requirements"] = [r.strip() for r in req_matches]

        # ── Extract people names from "Name (Role)" patterns ──
        people_pattern = r'(\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*\(([^)]+)\)'
        people_matches = re.findall(people_pattern, text)
        entities["people"] = [{"name": name, "role": role} for name, role in people_matches]

        # Deduplicate - handle mixed data types safely
        def safe_deduplicate(items):
            """Safely deduplicate mixed string/dict items"""
            seen = set()
            result = []
            for item in items:
                if isinstance(item, str):
                    if item not in seen:
                        seen.add(item)
                        result.append(item)
                elif isinstance(item, dict):
                    # Convert dict to string for comparison
                    item_str = str(sorted(item.items()))
                    if item_str not in seen:
                        seen.add(item_str)
                        result.append(item)
                else:
                    # Handle other types
                    item_str = str(item)
                    if item_str not in seen:
                        seen.add(item_str)
                        result.append(item)
            return result
        
        entities["dates"] = safe_deduplicate(entities["dates"])
        entities["action_items"] = safe_deduplicate(entities["action_items"])
        entities["requirements"] = safe_deduplicate(entities["requirements"])

        return entities

    # ────────────────────────────────────────────────────────────────────
    # SECTION 8: LOAD ALL DATA (ONE-CLICK)
    # ────────────────────────────────────────────────────────────────────

    def load_all_datasets(self) -> List[Dict]:
        """
        Load all available datasets in one call.

        Tries to load each dataset; falls back to samples if not available.

        RETURNS:
            Combined list of all loaded communications
        """
        print("=" * 60)
        print("📦 Loading All Datasets")
        print("=" * 60)

        all_data = []

        # Load Enron emails
        emails = self.load_enron()
        all_data.extend(emails)

        # Load AMI meetings
        meetings = self.load_ami()
        all_data.extend(meetings)

        # Load meeting transcripts
        transcripts = self.load_meeting_transcripts()
        all_data.extend(transcripts)

        # Generate synthetic chats from emails
        if emails:
            chats = self.generate_synthetic_chats(emails, num_chats=min(20, len(emails)))
            all_data.extend(chats)

        # Multi-channel data (Added by Senior Analyst)
        try:
            from brd_agent.multi_channel_fetcher import MultiChannelFetcher
            fetcher = MultiChannelFetcher()
            multi_channel_data = fetcher.fetch_all_channels()
            # Map fetcher format to ingestion format
            for item in multi_channel_data:
                all_data.append({
                    "type": "email" if item["source"] == "Gmail" else "meeting" if item["source"] == "Fireflies.ai" else "chat",
                    "content": item["content"],
                    "subject": item.get("subject", f"Multi-Channel: {item['source']}"),
                    "sender": item.get("user", "External API"),
                    "recipients": [],
                    "source_dataset": item["source"].lower()
                })
            print(f"   📡 Fetched {len(multi_channel_data)} items from multi-channel APIs")
        except Exception as e:
            print(f"   ⚠️ Multi-channel fetch skipped: {e}")

        print(f"\n📊 Ingestion Summary:")
        print(f"   Total loaded:    {self.stats['total_loaded']}")
        print(f"   Total filtered:  {self.stats['total_filtered']}")
        print(f"   Total chunks:    {self.stats['total_chunks']}")
        print("=" * 60)

        return all_data


# ============================================================================
# CONVENIENCE FUNCTIONS (for use without class)
# ============================================================================

def load_sample_data():
    """
    Quick function to load sample data and store in database.

    USAGE:
        python -c "from brd_agent.data_ingest import load_sample_data; load_sample_data()"
    """
    from brd_agent.db_setup import init_database, get_session, insert_communication, insert_sample_data

    init_database()
    session = get_session()

    try:
        # Insert built-in sample data
        insert_sample_data(session)

        # Load from ingestion engine
        engine = DataIngestionEngine()
        all_data = engine.load_all_datasets()

        # Store in database
        stored = 0
        for item in all_data:
            _, noise_score, is_noise = engine.preprocess_noise(item.get("content", ""))

            insert_communication(
                session,
                type=item["type"],
                content=item["content"],
                subject=item.get("subject"),
                sender=item.get("sender"),
                recipients=item.get("recipients"),
                source_dataset=item.get("source_dataset"),
                source_url=item.get("source_url"),
                is_noise=1 if is_noise else 0,
                noise_score=noise_score
            )
            stored += 1

        print(f"\n✅ Stored {stored} items in database")

    finally:
        session.close()


# ============================================================================
# MAIN (test the module)
# ============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("BRD Agent - Data Ingestion Test")
    print("=" * 60)

    engine = DataIngestionEngine()

    # Test loading sample data
    emails = engine.load_enron()
    print(f"\nLoaded {len(emails)} emails")

    if emails:
        # Test noise filtering
        cleaned, score, is_noise = engine.preprocess_noise(emails[0]["content"])
        print(f"\nNoise test: score={score:.2f}, is_noise={is_noise}")

        # Test chunking
        chunks = engine.chunk_text(emails[0]["content"])
        print(f"Chunks: {len(chunks)}")

        # Test entity extraction
        entities = engine.extract_entities(emails[0]["content"])
        print(f"Entities found: {json.dumps({k: len(v) for k, v in entities.items()})}")

        # Test synthetic chats
        chats = engine.generate_synthetic_chats(emails, num_chats=3)
        print(f"Generated {len(chats)} synthetic chats")
