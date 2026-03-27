"""
BRD Agent - Backend Extraction Engine (Module 2)
==================================================
The brain of the BRD Agent: uses LLM to extract structured BRD elements
from noisy communications.

PIPELINE:
  Raw Text ──→ Classify Channel ──→ Filter Noise ──→ Chunk ──→
  ──→ LLM Extract ──→ Merge Results ──→ Detect Conflicts ──→ BRD Output

FEATURES:
  - Multi-provider LLM support (Gemini, OpenAI, Together)
  - Chain-of-thought prompting for accurate extraction
  - TF-IDF based noise filtering
  - Hierarchical summarization (from original repo)
  - Sentiment-based conflict detection
  - Multi-topic clustering via KMeans
  - Ground truth validation against AMI summaries

HOW TO USE:
  from brd_agent.backend import BRDExtractionEngine
  engine = BRDExtractionEngine()
  brd = engine.extract_brd("We need the API ready by March 15...")
  print(brd["requirements"])     # List of requirements
  print(brd["stakeholders"])     # List of stakeholders
  print(brd["conflicts"])        # Detected conflicts
"""

import re
import json
import time
import asyncio
from typing import List, Dict, Optional, Tuple
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable

from brd_agent.config import (
    LLM_PROVIDER, GEMINI_API_KEY, OPENAI_API_KEY, TOGETHER_API_KEY, GROQ_API_KEY,
    get_llm_model, RELEVANCE_KEYWORDS, NOISE_KEYWORDS,
    ENABLE_CONFLICT_DETECTION, ENABLE_MULTI_TOPIC_CLUSTERING
)
from brd_agent.data_ingest import DataIngestionEngine


# ============================================================================
# BRD EXTRACTION ENGINE
# ============================================================================

class BRDExtractionEngine:
    """
    Main engine for extracting BRD elements from text using LLM.

    ARCHITECTURE:
      ┌─────────────┐     ┌──────────────┐     ┌──────────────┐
      │ classify     │ ──→ │ filter_noise │ ──→ │ extract_brd  │
      │ _channel()   │     │ _tfidf()     │     │ _via_llm()   │
      └─────────────┘     └──────────────┘     └──────┬───────┘
                                                       │
                          ┌──────────────┐     ┌──────┴───────┐
                          │ detect       │ ←── │ merge        │
                          │ _conflicts() │     │ _extractions │
                          └──────────────┘     └──────────────┘
    """

    def __init__(self):
        """Initialize the extraction engine with LLM client."""
        self.llm_provider = (LLM_PROVIDER or "local").lower()
        if self.llm_provider == "ollama":
            self.llm_provider = "local"
        self.model_name = get_llm_model()
        self.ingestion = DataIngestionEngine()
        self._init_llm_client()

    def _init_llm_client(self):
        """Initialize the appropriate LLM client based on config."""
        self.llm_client = None
        self.lc_chain = None

        if self.llm_provider == "groq":
            try:
                from groq import Groq
                self.llm_client = Groq(api_key=GROQ_API_KEY)
                
                # --- LangChain Integration for Groq ---
                try:
                    from langchain_groq import ChatGroq
                    from langchain_core.prompts import PromptTemplate
                    
                    self.lc_llm = ChatGroq(
                        model_name="llama-3.1-8b-instant", 
                        groq_api_key=GROQ_API_KEY,
                        temperature=0
                    )
                    
                    self.lc_prompt = PromptTemplate(
                        input_variables=["raw_data"],
                        template="""
                        Act as a Senior Business Requirements Analyst. 
                        Analyze the following multi-channel communication data and generate a structured BRD.

                        INPUT DATA:
                        {raw_data}

                        STRICT GUIDELINES:
                        1. NOISE FILTERING: Completely ignore greetings, casual talk, and non-project related info.
                        2. STRUCTURE: Include Executive Summary, Business Objectives, Functional/Non-Functional Requirements, and Stakeholders.
                        3. CONFLICT DETECTION: Identify and list any contradictions in deadlines, budget, or scope under a "CONFLICT ANALYSIS" section.
                        4. CITATIONS: Use [Source: Channel Name] for every requirement.
                        5. STYLE: Professional, corporate tone. NO EMOJIS.

                        OUTPUT FORMAT: Markdown
                        """
                    )
                    self.lc_chain = self.lc_prompt | self.lc_llm
                except Exception as lc_e:
                    print(f"Groq LangChain init error: {lc_e}. Synthesis might be disabled.")
                
                print(f"LLM initialized: Groq ({self.model_name})")
            except Exception as e:
                print(f"Groq init error: {e}")

        elif self.llm_provider in ("local",):
            try:
                from providers.llm.ollama import OllamaProvider

                self.llm_client = OllamaProvider({
                    "model": self.model_name,
                    "host": "http://localhost:11434",
                    "temperature": 0.2,
                    "num_predict": 2000,
                })
                print(f"LLM initialized: Ollama ({self.model_name})")
            except Exception as e:
                print(f"Ollama init error: {e}")

        if self.llm_client is None:
            print("No LLM client configured. Using rule-based extraction fallback.")
            if self.llm_provider == "groq":
                print("   Set GROQ_API_KEY in your env config.")
            elif self.llm_provider in ("local",):
                print("   Install/start Ollama and ensure the model is available locally.")

    # ────────────────────────────────────────────────────────────────────
    # SECTION 1: CHANNEL CLASSIFICATION
    # ────────────────────────────────────────────────────────────────────

    def classify_channel(self, text: str) -> str:
        """
        Classify the communication channel type from the text content.

        Uses keyword matching to determine if the text is an email,
        meeting transcript, or chat message.

        ALGORITHM:
          1. Check for email headers (From:, To:, Subject:)
          2. Check for meeting patterns (Attendees:, Speaker:, discussed)
          3. Check for chat patterns (timestamps, @mentions)
          4. Default to "email" if unclear

        PARAMS:
            text: Raw input text

        RETURNS:
            One of: "email", "meeting", or "chat"
        """
        text_lower = text.lower()

        # Email indicators
        email_score = 0
        email_markers = ["from:", "to:", "subject:", "cc:", "bcc:",
                         "regards,", "best,", "sincerely,", "dear "]
        for marker in email_markers:
            if marker in text_lower:
                email_score += 1

        # Meeting indicators
        meeting_score = 0
        meeting_markers = ["attendees:", "participants:", "meeting transcript",
                          "facilitator:", "scrum master:", "minutes of meeting",
                          "action items:", "agenda:", "discussed"]
        for marker in meeting_markers:
            if marker in text_lower:
                meeting_score += 1

        # Chat indicators
        chat_score = 0
        chat_patterns = [
            r'\[\d{4}-\d{2}-\d{2}',         # [2026-02-14
            r'@\w+:',                         # @username:
            r'#\w+.*channel',                 # #channel
            r'\d{1,2}:\d{2}\]?\s*@?\w+:',   # 09:15] @user:
        ]
        for pattern in chat_patterns:
            if re.search(pattern, text):
                chat_score += 1

        # Return the type with highest score
        scores = {"email": email_score, "meeting": meeting_score, "chat": chat_score}
        result = max(scores, key=scores.get)

        # Default to "email" if all scores are 0
        return result if scores[result] > 0 else "email"

    # ────────────────────────────────────────────────────────────────────
    # SECTION 2: NOISE FILTERING (TF-IDF)
    # ────────────────────────────────────────────────────────────────────

    def filter_noise_tfidf(self, text: str, threshold: float = 0.3) -> Tuple[str, float]:
        """
        Filter noise using TF-IDF vectorizer to rank sentences by relevance.

        ALGORITHM:
          1. Split text into sentences
          2. Build TF-IDF matrix with relevance keywords as reference
          3. Score each sentence by cosine similarity to reference
          4. Keep sentences above threshold
          5. Return filtered text with overall relevance score

        PARAMS:
            text:      Input text to filter
            threshold: Minimum relevance score to keep a sentence (0-1)

        RETURNS:
            Tuple of (filtered_text, relevance_score)
        """
        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.metrics.pairwise import cosine_similarity
            import numpy as np
        except ImportError:
            # Fallback: use simple keyword filtering
            return self._simple_noise_filter(text)

        # Split into sentences
        sentences = re.split(r'(?<=[.!?])\s+|\n', text)
        sentences = [s.strip() for s in sentences if s.strip() and len(s.strip()) > 10]

        if not sentences:
            return text, 0.5

        # Create reference document from relevance keywords
        reference = " ".join(RELEVANCE_KEYWORDS)

        # Build TF-IDF matrix
        all_docs = [reference] + sentences
        try:
            vectorizer = TfidfVectorizer(
                stop_words="english",
                max_features=1000,
                min_df=1
            )
            tfidf_matrix = vectorizer.fit_transform(all_docs)

            # Calculate similarity of each sentence to the reference
            ref_vector = tfidf_matrix[0:1]
            sentence_vectors = tfidf_matrix[1:]
            similarities = cosine_similarity(ref_vector, sentence_vectors)[0]

            # Keep sentences above threshold
            relevant_sentences = []
            for sent, sim in zip(sentences, similarities):
                if sim >= threshold:
                    relevant_sentences.append(sent)

            if not relevant_sentences:
                # If nothing passes threshold, keep top 50%
                sorted_pairs = sorted(zip(sentences, similarities),
                                      key=lambda x: x[1], reverse=True)
                half = max(1, len(sorted_pairs) // 2)
                relevant_sentences = [s for s, _ in sorted_pairs[:half]]

            filtered_text = " ".join(relevant_sentences)
            avg_score = float(np.mean(similarities))

            return filtered_text, avg_score

        except Exception:
            return self._simple_noise_filter(text)

    def _simple_noise_filter(self, text: str) -> Tuple[str, float]:
        """Fallback noise filter using simple keyword matching."""
        cleaned, score, _ = self.ingestion.preprocess_noise(text)
        return cleaned, 1.0 - score

    # ────────────────────────────────────────────────────────────────────
    # SECTION 3: LLM-BASED EXTRACTION (Core Logic)
    # ────────────────────────────────────────────────────────────────────

    def extract_brd_langchain(self, raw_data: str) -> str:
        """
        Synthesize BRD using LangChain pipeline for high-noise Enron/AMI data.
        Returns raw Markdown output.
        """
        if not getattr(self, "lc_chain", None):
            return ""
        
        max_retries = 3
        base_delay = 5
        
        for attempt in range(max_retries):
            try:
                response = self.lc_chain.invoke({"raw_data": raw_data})
                return response.content
            except Exception as e:
                if "429" in str(e) or "RESOURCE_EXHAUSTED" in str(e):
                    if attempt < max_retries - 1:
                        delay = base_delay * (2 ** attempt)
                        print(f"   LangChain Rate Limit hit. Retrying in {delay}s...")
                        time.sleep(delay)
                        continue
                return f"LangChain Error: {str(e)}"
        return "LangChain synthesis failed after retries due to rate limits."

    def extract_brd(self, text: str, channel_type: Optional[str] = None) -> Dict:
        """
        Extract structured BRD elements from input text using LLM.

        This is the MAIN FUNCTION of the extraction engine.

        PIPELINE:
          1. Auto-classify channel type if not provided
          2. Filter noise using TF-IDF
          3. Chunk long texts
          4. Extract BRD elements from each chunk via LLM
          5. Merge results
          6. Detect conflicts in feedback
          7. Return structured BRD

        PARAMS:
            input_text:   Raw communication text (email/meeting/chat)
            channel_type: Optional override for channel type

        RETURNS:
            Dict with keys:
              - channel_type: "email", "meeting", or "chat"
              - project_topic: Auto-detected project name/topic
              - requirements: List of requirement strings
              - decisions: List of decision strings
              - stakeholders: List of {name, role} dicts
              - timelines: List of {date, milestone} dicts
              - feedback: List of feedback strings
              - action_items: List of action item strings
              - conflicts: List of {description, severity} dicts
              - noise_score: 0.0-1.0 noise level
              - confidence_score: 0.0-1.0 confidence
              - raw_filtered_text: Text after noise removal
        """
        print("Starting BRD extraction...")

        # Step 1: Classify channel
        if not channel_type:
            channel_type = self.classify_channel(text)
        print(f"   Channel type: {channel_type}")

        # Step 2: Filter noise
        filtered_text, relevance_score = self.filter_noise_tfidf(text)
        print(f"   Noise filtering: relevance={relevance_score:.2f}")

        # Step 3: Extract entities using regex (fast, no LLM needed)
        regex_entities = self.ingestion.extract_entities(filtered_text)

        # Step 4: Chunk text if needed
        chunks = self.ingestion.chunk_text(filtered_text)
        print(f"   Text chunks: {len(chunks)}")

        # Step 5: Extract via LLM (or fallback to regex)
        if self.llm_client:
            brd_result = self._extract_via_llm(chunks, channel_type)
        else:
            brd_result = self._extract_via_regex(filtered_text, regex_entities)

        # Step 6: Merge regex entities with LLM results
        brd_result = self._merge_extractions(brd_result, regex_entities)

        # Step 7: LangChain Cross-Channel Synthesis (Advanced BI logic)
        st_langchain_md = self.extract_brd_langchain(filtered_text)
        brd_result["markdown_report"] = st_langchain_md

        # Step 8: Detect conflicts
        if ENABLE_CONFLICT_DETECTION and brd_result.get("feedback"):
            conflicts = self.detect_conflicts(brd_result["feedback"])
            brd_result["conflicts"] = conflicts

        # Add metadata
        brd_result["channel_type"] = channel_type
        brd_result["noise_score"] = 1.0 - relevance_score
        brd_result["raw_filtered_text"] = filtered_text
        brd_result["confidence_score"] = self._calculate_confidence(brd_result)

        print(f"   Extraction complete! Confidence: {brd_result['confidence_score']:.2f}")
        return brd_result

    def _extract_via_llm(self, chunks: List[str], channel_type: str) -> Dict:
        """
        Extract BRD elements using LLM with chain-of-thought prompting.

        Uses a carefully crafted prompt that instructs the LLM to:
          1. First identify the project/topic
          2. Then extract each BRD element type
          3. Output in strict JSON format
        """
        all_results = []

        for i, chunk in enumerate(chunks):
            prompt = self._build_extraction_prompt(chunk, channel_type)

            try:
                raw_response = self._call_llm(prompt)
                parsed = self._parse_llm_response(raw_response)
                all_results.append(parsed)
            except Exception as e:
                print(f"   LLM extraction error on chunk {i+1}: {e}")
                continue

        # Merge results from all chunks
        if all_results:
            return self._merge_chunk_results(all_results)
        else:
            return self._empty_brd_result()

    def _build_extraction_prompt(self, text: str, channel_type: str) -> str:
        """
        Build a premium extraction prompt for a Senior AI Business Analyst.
        
        Incorporates:
          - Senior Analyst persona
          - Multi-channel awareness (Gmail, Slack, Transcripts)
          - Strict Citation logic (RTM)
          - Stakeholder Sentiment Analysis
          - Mermaid.js Diagram Generation
        """
        channel_sources = {
            "email": "Gmail",
            "meeting": "Fireflies.ai / Transcripts",
            "chat": "Slack / Communication Channels"
        }
        source_name = channel_sources.get(channel_type, "External Source")

        prompt = f"""### SYSTEM ROLE:
You are an Advanced Business Intelligence Agent specializing in High-Noise Data Extraction. You have expert knowledge of the Enron Email Dataset (Corporate Communication) and the AMI Meeting Corpus (Design Project Transcripts). Your goal is to perform "Cross-Channel Synthesis".

### OBJECTIVES:
1. STRATEGIC FILTERING: Strip away lunch plans, personal chats, newsletters, and routine FYIs.
2. EXTRACTION: Find specific Functional/Non-Functional requirements, decisions, and outcomes.
3. CROSS-CHANNEL VALIDATION: Cross-reference information across channels. 
   - CRITICAL CONFLICT: If a decision in a Meeting (AMI/Transcript) contradicts an instruction in an Email (Enron), mark it as a 'CRITICAL CONFLICT' with high severity.
4. STAKEHOLDER MAPPING: Derive organizational hierarchy and influence from To/CC patterns and roles.
5. EXPLAINABILITY: Provide a reasoning for why certain portions of the data were ignored as noise.

### INPUT TEXT:
---
{text}
---

### OUTPUT REQUIREMENTS:
- Use professional language and maintain realism grounded in the text.
- Metadata: Tag citations with [Enron Corpus 2026] or [AMI Meeting Corpus] appropriately.
- Mermaid Diagrams: Generate a simple flowchart showing the project workflow or architecture discussed in the text.

IMPORTANT: Return ONLY valid JSON in this exact format:
{{
    "execution_summary": "string - high-level project goal and synthesis",
    "project_topic": "string - project name",
    "requirements": [
        {{
            "id": "REQ-001", 
            "text": "Requirement", 
            "type": "Functional/Non-Functional", 
            "source": "Enron ID# / AMI Segment#",
            "status": "pending_review"
        }}
    ],
    "decisions": [
        {{
            "text": "Decision description",
            "source": "{source_name}"
        }}
    ],
    "stakeholders": [
        {{
            "name": "string", 
            "role": "string", 
            "stance": "supportive/hesitant",
            "sentiment": "happy/frustrated/concerned"
        }}
    ],
    "conflicts": [{{ "description": "Contradiction detail", "severity": "CRITICAL/high/med" }}],
    "noise_reduction_logic": "string - Explain why certain portions of the data were ignored for transparency",
    "mermaid_code": "string - Generate a simple mermaid flowchart. Example: 'flowchart TD\\n    A[Start] --> B[Requirement]\\n    B --> C[Decision]\\n    C --> D[Implementation]'",
    "project_health_score": 0-100
}}

Return ONLY the JSON object. No extra text."""

        return prompt

    def simulate_scenario(self, current_brd: Dict, scenario: str) -> Dict:
        """
        Smart 'What-If' Simulator for business impact analysis.
        
        Predicts how changes (like deadline extensions or budget cuts) 
        affect stakeholder sentiment and project health.
        """
        if not self.llm_client:
            return {"error": "LLM not available for simulation"}

        prompt = f"""You are a Strategic Project Risk Analyst. 
Based on the current BRD extraction:
{json.dumps(current_brd, indent=2)}

SIMULATE THIS SCENARIO:
"{scenario}"

Predict the impact on:
1. Stakeholder Sentiment (Who gets frustrated? Who is happy?)
2. Project Health Score (0-100)
3. New Risks or Conflicts introduced.

Return ONLY a JSON object:
{{
    "analysis": "string - detailed professional analysis",
    "impacted_stakeholders": [{{ "name": "string", "new_sentiment": "string", "reason": "string" }}],
    "new_health_score": integer,
    "advice": "string - how to mitigate risks"
}}"""

        try:
            raw_response = self._call_llm(prompt)
            return self._parse_llm_response(raw_response)
        except Exception as e:
            return {"error": str(e)}

    def _call_llm(self, prompt: str) -> str:
        """
        Call the configured LLM provider.
        """
        if self.llm_provider == "groq":
            response = self.llm_client.chat.completions.create(
                model=self.model_name,
                messages=[
                    {"role": "system", "content": "You are a BRD extraction expert. Always return valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.2,
                max_tokens=2000
            )
            return response.choices[0].message.content

        if self.llm_provider in ("local",):
            messages = [
                {"role": "system", "content": "You are a BRD extraction expert. Always return valid JSON."},
                {"role": "user", "content": prompt}
            ]
            return asyncio.run(
                self.llm_client.chat_async(
                    messages,
                    temperature=0.2,
                    num_predict=2000
                )
            )

        return ""

    def _parse_llm_response(self, response: str) -> Dict:
        """
        Parse the LLM response into a structured dict.

        Handles common issues like:
          - Extra text before/after JSON
          - Markdown code blocks around JSON
          - Slightly malformed JSON
        """
        if not response:
            return self._empty_brd_result()

        # Remove markdown code blocks if present
        cleaned = response.strip()
        cleaned = re.sub(r'^```(?:json)?\s*\n?', '', cleaned)
        cleaned = re.sub(r'\n?\s*```$', '', cleaned)

        # Try to find JSON object in the response
        json_match = re.search(r'\{[\s\S]*\}', cleaned)
        if json_match:
            try:
                parsed = json.loads(json_match.group())

                # Validate expected fields exist
                result = self._empty_brd_result()
                result["project_topic"] = parsed.get("project_topic", "")
                result["requirements"] = parsed.get("requirements", [])
                result["decisions"] = parsed.get("decisions", [])
                result["stakeholders"] = parsed.get("stakeholders", [])
                result["timelines"] = parsed.get("timelines", [])
                result["feedback"] = parsed.get("feedback", [])
                result["action_items"] = parsed.get("action_items", [])
                result["conflicts"] = parsed.get("conflicts", [])
                result["noise_reduction_logic"] = parsed.get("noise_reduction_logic", "")
                result["mermaid_code"] = parsed.get("mermaid_code", "")
                result["project_health_score"] = parsed.get("project_health_score", 85)

                return result
            except json.JSONDecodeError:
                pass

        # Fallback: return raw response as-is
        result = self._empty_brd_result()
        result["raw_llm_output"] = response
        
        # Generate a simple fallback mermaid diagram if none provided
        if not result.get("mermaid_code") or not result.get("mermaid_code").strip():
            result["mermaid_code"] = """flowchart TD
    A[Project Start] --> B[Requirements Gathering]
    B --> C[Stakeholder Analysis]
    C --> D[Decision Making]
    D --> E[Implementation]
    E --> F[Project Completion]"""
        
        return result

    def _extract_via_regex(self, text: str, entities: Dict) -> Dict:
        """
        Fallback extraction using regex when no LLM is available.

        This provides basic extraction without any API keys.
        Not as accurate as LLM but gives reasonable results.
        """
        print("   Using regex-based extraction (no LLM configured)")

        result = self._empty_brd_result()

        # Extract project topic from subject line or first sentence
        subject_match = re.search(r'Subject:\s*(?:RE:\s*)?(.+)', text, re.IGNORECASE)
        if subject_match:
            result["project_topic"] = subject_match.group(1).strip()
        else:
            # Use first line as topic
            first_line = text.split("\n")[0].strip()
            result["project_topic"] = first_line[:100] if first_line else "Untitled"

        # Requirements: sentences with must/shall/should/need
        req_patterns = [
            r'(?:^|\n)\s*\d+\.\s*(.+?(?:must|shall|should|need|required).+?)(?:\n|$)',
            r'(?:requirement|req)\s*(?:\d+)?[:\s]+(.+?)(?:\n|$)',
            r'(?:^|\n)\s*[-•]\s*(.+?(?:must|shall|should|need|required).+?)(?:\n|$)',
        ]
        for pattern in req_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
            result["requirements"].extend([m.strip() for m in matches])

        # Also add numbered items that look like specs
        numbered = re.findall(r'(?:^|\n)\s*(\d+)\.\s+(.+?)(?:\n|$)', text,  re.MULTILINE)
        for num, content in numbered:
            if any(kw in content.lower() for kw in ["must", "support", "api", "system",
                                                      "data", "user", "performance"]):
                result["requirements"].append(content.strip())

        # Decisions: lines with "decision", "agreed", "approved"
        dec_patterns = [
            r'(?:decision|decided|agreed|approved)[:\s]+(.+?)(?:\n|$)',
            r'(?:^|\n)\s*(?:Decision):\s*(.+?)(?:\n|$)',
        ]
        for pattern in dec_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
            result["decisions"].extend([m.strip() for m in matches])

        # Stakeholders from entities
        result["stakeholders"] = entities.get("people", [])

        # Also find "Name (Role)" patterns
        people = re.findall(r'(\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*\(([^)]+)\)', text)
        for name, role in people:
            if not any(s.get("name") == name for s in result["stakeholders"]):
                result["stakeholders"].append({"name": name, "role": role})

        # Timelines from entities
        for date_str in entities.get("dates", []):
            result["timelines"].append({"date": date_str, "milestone": "Deadline"})

        # Look for timeline patterns with context
        timeline_patterns = [
            r'(.+?)\s*(?:by|due|deadline|before|complete by)\s+(.+?)(?:\n|$|\.)',
            r'Phase\s*\d+\s*(?:\([^)]*\))?\s*[:\-]\s*(?:Complete|Target|Due)\s*(?:by)?\s*(.+?)(?:\n|$)',
        ]
        for pattern in timeline_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE)
            for match in matches:
                if isinstance(match, tuple) and len(match) >= 2:
                    result["timelines"].append({
                        "date": match[-1].strip(),
                        "milestone": match[0].strip()[:100]
                    })

        # Action items from entities
        result["action_items"] = entities.get("action_items", [])

        # Feedback: lines with concern, disagree, issue, risk
        feedback_patterns = [
            r'(?:concern|risk|issue|disagree|worry|problem|blocker)[:\s]*(.+?)(?:\n|$)',
            r'(?:feedback|comment|suggestion|recommend)[:\s]*(.+?)(?:\n|$)',
        ]
        for pattern in feedback_patterns:
            matches = re.findall(pattern, text, re.IGNORECASE | re.MULTILINE)
            result["feedback"].extend([m.strip() for m in matches])

        # Deduplicate all lists (only string items)
        for key in ["requirements", "decisions", "action_items", "feedback"]:
            if key in result and isinstance(result[key], list):
                # Filter only string items for deduplication
                string_items = [item for item in result[key] if isinstance(item, str)]
                result[key] = list(set(string_items))
        
        # Add fallback mermaid diagram for regex extraction
        result["mermaid_code"] = """flowchart TD
    A[Input Analysis] --> B[Pattern Matching]
    B --> C[Entity Extraction]
    C --> D[Requirements Identified]
    D --> E[Timeline Detection]
    E --> F[BRD Output]"""

        return result

    # ────────────────────────────────────────────────────────────────────
    # SECTION 4: CONFLICT DETECTION
    # ────────────────────────────────────────────────────────────────────

    def detect_conflicts(self, feedback_items: List[str]) -> List[Dict]:
        """
        Detect conflicts in stakeholder feedback using sentiment analysis.

        ALGORITHM:
          1. Analyze sentiment of each feedback item using TextBlob
          2. Group feedback by topic (keyword similarity)
          3. If opposing sentiments exist for same topic, flag as conflict
          4. Rate severity based on sentiment polarity difference

        PARAMS:
            feedback_items: List of feedback strings

        RETURNS:
            List of conflict dicts: [{description, severity, items}]
        """
        if not feedback_items or len(feedback_items) < 2:
            return []

        try:
            from textblob import TextBlob
        except ImportError:
            print("   TextBlob not installed. Skipping conflict detection.")
            return []

        conflicts = []
        sentiments = []

        # Analyze sentiment of each feedback item
        for item in feedback_items:
            blob = TextBlob(item)
            sentiments.append({
                "text": item,
                "polarity": blob.sentiment.polarity,      # -1 to 1
                "subjectivity": blob.sentiment.subjectivity  # 0 to 1
            })

        # Compare pairs for opposing sentiments
        for i in range(len(sentiments)):
            for j in range(i + 1, len(sentiments)):
                s1 = sentiments[i]
                s2 = sentiments[j]

                # Check if sentiments are opposing (one positive, one negative)
                if (s1["polarity"] * s2["polarity"] < 0 and
                        abs(s1["polarity"]) > 0.1 and abs(s2["polarity"]) > 0.1):

                    severity_diff = abs(s1["polarity"] - s2["polarity"])
                    severity = "high" if severity_diff > 1.0 else "medium" if severity_diff > 0.5 else "low"

                    conflicts.append({
                        "description": f"Conflicting feedback detected",
                        "item_1": s1["text"],
                        "item_2": s2["text"],
                        "severity": severity,
                        "polarity_diff": round(severity_diff, 2)
                    })

        # Also check for explicit conflict keywords
        conflict_keywords = ["disagree", "conflict", "oppose", "contrary",
                             "however", "on the other hand", "inconsistent"]
        for item in feedback_items:
            for keyword in conflict_keywords:
                if keyword in item.lower():
                    conflicts.append({
                        "description": f"Explicit disagreement detected",
                        "item_1": item,
                        "item_2": "",
                        "severity": "medium",
                        "polarity_diff": 0
                    })
                    break

        return conflicts

    # ────────────────────────────────────────────────────────────────────
    # SECTION 5: MULTI-TOPIC CLUSTERING
    # ────────────────────────────────────────────────────────────────────

    def cluster_topics(self, texts: List[str], n_clusters: int = 3) -> List[Dict]:
        """
        Cluster texts into topics using KMeans on TF-IDF embeddings.

        ALGORITHM:
          1. Vectorize texts using TF-IDF
          2. Apply KMeans clustering
          3. Extract top keywords per cluster
          4. Return clusters with texts and keywords

        PARAMS:
            texts:      List of text strings to cluster
            n_clusters: Number of topic clusters

        RETURNS:
            List of cluster dicts: [{topic_keywords, texts, cluster_id}]
        """
        if not texts or len(texts) < n_clusters:
            return [{"topic_keywords": ["general"], "texts": texts, "cluster_id": 0}]

        try:
            from sklearn.feature_extraction.text import TfidfVectorizer
            from sklearn.cluster import KMeans
            import numpy as np
        except ImportError:
            print("   ⚠️ scikit-learn not installed. Skipping clustering.")
            return [{"topic_keywords": ["general"], "texts": texts, "cluster_id": 0}]

        try:
            # Vectorize
            vectorizer = TfidfVectorizer(
                max_features=500,
                stop_words="english",
                min_df=1
            )
            tfidf_matrix = vectorizer.fit_transform(texts)
            feature_names = vectorizer.get_feature_names_out()

            # Cluster
            n_clusters = min(n_clusters, len(texts))
            kmeans = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
            labels = kmeans.fit_predict(tfidf_matrix)

            # Build cluster results
            clusters = []
            for cluster_id in range(n_clusters):
                cluster_mask = labels == cluster_id
                cluster_texts = [t for t, m in zip(texts, cluster_mask) if m]

                # Get top keywords for this cluster
                center = kmeans.cluster_centers_[cluster_id]
                top_indices = center.argsort()[-5:][::-1]
                top_keywords = [feature_names[i] for i in top_indices]

                clusters.append({
                    "cluster_id": cluster_id,
                    "topic_keywords": list(top_keywords),
                    "texts": cluster_texts,
                    "size": len(cluster_texts)
                })

            return clusters

        except Exception as e:
            print(f"   ⚠️ Clustering error: {e}")
            return [{"topic_keywords": ["general"], "texts": texts, "cluster_id": 0}]

    # ────────────────────────────────────────────────────────────────────
    # SECTION 6: GROUND TRUTH VALIDATION
    # ────────────────────────────────────────────────────────────────────

    def validate_with_ground_truth(self, extracted_summary: str,
                                    ground_truth: str) -> Dict:
        """
        Validate extraction accuracy against AMI ground truth summaries.

        Uses simple text overlap metrics (no external dependencies needed).

        PARAMS:
            extracted_summary: Our extracted BRD summary text
            ground_truth:     Human-written summary from AMI corpus

        RETURNS:
            Dict with precision, recall, f1_score, matched_keywords
        """
        if not extracted_summary or not ground_truth:
            return {"precision": 0, "recall": 0, "f1_score": 0, "matched_keywords": []}

        # Tokenize and normalize
        def tokenize(text):
            words = re.findall(r'\b\w+\b', text.lower())
            # Remove stopwords (basic list)
            stopwords = {"the", "a", "an", "is", "are", "was", "were", "be",
                         "been", "being", "have", "has", "had", "do", "does",
                         "did", "will", "would", "could", "should", "may",
                         "might", "must", "shall", "can", "need", "dare",
                         "to", "of", "in", "for", "on", "with", "at", "by",
                         "from", "as", "into", "through", "during", "before",
                         "after", "above", "below", "between", "and", "but",
                         "or", "not", "it", "this", "that", "these", "those",
                         "i", "you", "he", "she", "we", "they", "me", "him",
                         "her", "us", "them", "my", "your", "his", "its",
                         "our", "their"}
            return set(w for w in words if w not in stopwords and len(w) > 2)

        extracted_tokens = tokenize(extracted_summary)
        truth_tokens = tokenize(ground_truth)

        if not extracted_tokens or not truth_tokens:
            return {"precision": 0, "recall": 0, "f1_score": 0, "matched_keywords": []}

        matched = extracted_tokens & truth_tokens

        precision = len(matched) / len(extracted_tokens) if extracted_tokens else 0
        recall = len(matched) / len(truth_tokens) if truth_tokens else 0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0

        return {
            "precision": round(precision, 3),
            "recall": round(recall, 3),
            "f1_score": round(f1, 3),
            "matched_keywords": list(matched)[:20]
        }

    # ────────────────────────────────────────────────────────────────────
    # SECTION 7: REFINEMENT (AI-Suggested Edits)
    # ────────────────────────────────────────────────────────────────────

    def refine_brd(self, current_brd: Dict, user_instruction: str) -> Dict:
        """
        Refine an existing BRD extraction based on user feedback.

        PARAMS:
            current_brd:      Current BRD dict
            user_instruction: User's refinement instruction

        RETURNS:
            Updated BRD dict with 'refinement_reasoning' and 'change_summary'
        """
        if not self.llm_client:
            return current_brd

        prompt = f"""You previously extracted this BRD:
{json.dumps(current_brd, indent=2)}

The user wants you to refine it with this instruction:
"{user_instruction}"

Please update the BRD accordingly and return the complete updated JSON.
IMPORTANT: In the returned JSON, also include these two EXTRA fields:
  "refinement_reasoning": "A 2-3 sentence explanation of WHY these changes were made, referencing the user instruction.",
  "change_summary": "A bullet-list summary of WHAT exactly was changed (e.g., 'Deadline updated from March 1 to March 20', 'Added new security requirement REQ-005')."

Return ONLY valid JSON in the same format as above, with the two extra fields added."""

        try:
            raw_response = self._call_llm(prompt)
            refined = self._parse_llm_response(raw_response)
            if refined.get("requirements") or refined.get("decisions"):
                # Ensure reasoning fields exist
                if "refinement_reasoning" not in refined:
                    refined["refinement_reasoning"] = f"Refined based on user instruction: {user_instruction}"
                if "change_summary" not in refined:
                    refined["change_summary"] = f"Changes applied per instruction: {user_instruction}"
                return refined
        except Exception as e:
            print(f"   Refinement error: {e}")

        return current_brd

    # ────────────────────────────────────────────────────────────────────
    # HELPER METHODS
    # ────────────────────────────────────────────────────────────────────

    def _empty_brd_result(self) -> Dict:
        """Return an empty BRD result template."""
        return {
            "project_topic": "",
            "requirements": [],
            "decisions": [],
            "stakeholders": [],
            "timelines": [],
            "feedback": [],
            "action_items": [],
            "conflicts": [],
            "noise_reduction_logic": "",
            "mermaid_code": "",
            "project_health_score": 85,
            "raw_llm_output": "",
            "confidence_score": 0.0,
            "noise_score": 0.0
        }

    def _merge_chunk_results(self, results: List[Dict]) -> Dict:
        """Merge extraction results from multiple chunks."""
        merged = self._empty_brd_result()

        for result in results:
            if result.get("project_topic") and not merged["project_topic"]:
                merged["project_topic"] = result["project_topic"]

            # Handle mermaid code - use the first non-empty one
            if not merged.get("mermaid_code") or not merged["mermaid_code"].strip():
                merged["mermaid_code"] = result.get("mermaid_code", "")
            
            # Handle other fields
            for key in ["requirements", "decisions", "feedback", "action_items"]:
                items = result.get(key, [])
                if isinstance(items, list):
                    merged[key].extend(items)

            for s in result.get("stakeholders", []):
                if isinstance(s, dict):
                    if not any(existing.get("name") == s.get("name")
                               for existing in merged["stakeholders"]):
                        merged["stakeholders"].append(s)
                elif isinstance(s, str):
                    merged["stakeholders"].append({"name": s, "role": "Unknown"})

            for t in result.get("timelines", []):
                if isinstance(t, dict):
                    merged["timelines"].append(t)

        # Deduplicate
        for key in ["requirements", "decisions", "feedback", "action_items"]:
            if key in merged and isinstance(merged[key], list):
                # Handle string deduplication
                string_items = []
                for item in merged[key]:
                    if isinstance(item, str):
                        string_items.append(item)
                    elif isinstance(item, dict) and "text" in item:
                        string_items.append(item["text"])
                merged[key] = list(set(string_items))

        # Final fallback for mermaid code
        if not merged.get("mermaid_code") or not merged["mermaid_code"].strip():
            merged["mermaid_code"] = """flowchart TD
    A[Project Analysis] --> B[Requirements Extraction]
    B --> C[Stakeholder Identification]
    C --> D[Decision Documentation]
    D --> E[BRD Generation]
    E --> F[Final Output]"""

        return merged

    def _merge_extractions(self, llm_result: Dict, regex_entities: Dict) -> Dict:
        """Merge LLM and regex extraction results."""
        # Add regex-found items that LLM missed
        for date in regex_entities.get("dates", []):
            if not any(t.get("date") == date for t in llm_result.get("timelines", [])):
                llm_result.setdefault("timelines", []).append({
                    "date": date, "milestone": "Detected deadline"
                })

        for person in regex_entities.get("people", []):
            if not any(s.get("name") == person.get("name")
                       for s in llm_result.get("stakeholders", [])):
                llm_result.setdefault("stakeholders", []).append(person)

        for req in regex_entities.get("requirements", []):
            if req not in llm_result.get("requirements", []):
                llm_result.setdefault("requirements", []).append(req)

        for action in regex_entities.get("action_items", []):
            if action not in llm_result.get("action_items", []):
                llm_result.setdefault("action_items", []).append(action)

        return llm_result

    def _calculate_confidence(self, brd: Dict) -> float:
        """Calculate a confidence score based on how much was extracted."""
        score = 0.0
        weights = {
            "requirements": 0.25,
            "decisions": 0.2,
            "stakeholders": 0.2,
            "timelines": 0.15,
            "feedback": 0.1,
            "action_items": 0.1
        }

        for key, weight in weights.items():
            items = brd.get(key, [])
            if items:
                # More items = higher confidence, with diminishing returns
                item_score = min(1.0, len(items) / 3)
                score += weight * item_score

        if brd.get("project_topic"):
            score = min(1.0, score + 0.1)

        return round(score, 2)


# ============================================================================
# CONVENIENCE FUNCTION
# ============================================================================

def quick_extract(text: str) -> Dict:
    """
    Quick one-line extraction for testing.

    USAGE:
        from brd_agent.backend import quick_extract
        result = quick_extract("We need the API ready by March 15...")
    """
    engine = BRDExtractionEngine()
    return engine.extract_brd(text)


# ============================================================================
# MAIN (test the module)
# ============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("BRD Agent - Backend Extraction Test")
    print("=" * 60)

    engine = BRDExtractionEngine()

    test_text = """From: john.smith@company.com
To: dev-team@company.com
Subject: Project Alpha - API Requirements

Team,

Here are the confirmed requirements for the API integration:

1. RESTful API endpoints must support JSON format
2. Authentication via OAuth 2.0 is mandatory
3. Response time must be under 200ms for 95th percentile
4. The data migration must be completed by March 15, 2026

Decision: We'll use PostgreSQL instead of MongoDB.

Stakeholders:
- John Smith (Project Manager)
- Sarah Jones (Tech Lead)

Risk: The vendor hasn't confirmed their timeline.

Action items:
- Sarah: Draft API spec by Feb 20
- John: Schedule review meeting for March 1

Best,
John"""

    print("\n📝 Test Input (email):")
    print(test_text[:200] + "...")

    result = engine.extract_brd(test_text)

    print(f"\n📊 Extraction Results:")
    print(f"   Topic:         {result.get('project_topic', 'N/A')}")
    print(f"   Requirements:  {len(result.get('requirements', []))}")
    print(f"   Decisions:     {len(result.get('decisions', []))}")
    print(f"   Stakeholders:  {len(result.get('stakeholders', []))}")
    print(f"   Timelines:     {len(result.get('timelines', []))}")
    print(f"   Action Items:  {len(result.get('action_items', []))}")
    print(f"   Conflicts:     {len(result.get('conflicts', []))}")
    print(f"   Confidence:    {result.get('confidence_score', 0)}")
    print(f"\n   Full result:")
    print(json.dumps(result, indent=2, default=str)[:2000])
