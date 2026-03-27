"""
Lightweight ingestion enhancer inspired by the legacy BRD Agent.
Provides noise filtering, text cleaning, chunking, and entity extraction
for multi-channel communications.
"""

import re
from typing import List, Tuple, Dict

RELEVANCE_KEYWORDS = [
    "requirement", "requirements", "must", "shall", "should", "need",
    "feature", "specification", "deadline", "timeline", "milestone",
    "stakeholder", "decision", "approved", "rejected", "budget",
    "priority", "scope", "deliverable", "objective", "constraint",
    "risk", "dependency", "acceptance criteria", "user story",
    "functional", "non-functional", "integration", "api", "database",
    "security", "performance", "scalability", "compliance", "action item",
    "feedback", "review", "approve", "sign-off", "phase", "sprint",
]

NOISE_KEYWORDS = [
    "lunch", "newsletter", "happy hour", "birthday", "potluck",
    "parking", "weather", "sports", "fantasy football", "recipe",
    "vacation photos", "joke", "forward:", "fw:", "fyi",
    "out of office", "unsubscribe", "spam", "advertisement",
    "personal", "weekend plans", "social event",
]

CHUNK_SIZE = 512
CHUNK_OVERLAP = 50


class IngestionEnhancer:
    """Utility for filtering noise and preparing text for BRD extraction."""

    def preprocess_noise(self, text: str) -> Tuple[str, float, bool]:
        if not text:
            return "", 1.0, True

        text_lower = text.lower()
        relevance_hits = sum(1 for kw in RELEVANCE_KEYWORDS if kw in text_lower)
        noise_hits = sum(1 for kw in NOISE_KEYWORDS if kw in text_lower)

        total_hits = relevance_hits + noise_hits
        noise_score = noise_hits / total_hits if total_hits else 0.5
        is_noise = noise_score > 0.6

        cleaned = self._clean_text(text)
        return cleaned, noise_score, is_noise

    def _clean_text(self, text: str) -> str:
        lines = text.split("\n")
        cleaned_lines = []
        in_signature = False

        for line in lines:
            stripped = line.strip()
            if stripped in {"--", "---", "____", "====", "Best,", "Thanks,", "Regards,", "Cheers,", "Best regards,"}:
                in_signature = True
                continue

            if in_signature:
                if stripped.startswith(("From:", "Subject:", "Date:", "---")):
                    in_signature = False
                else:
                    continue

            if re.match(r'^(>|\|)\s*', stripped):
                continue
            if re.match(r'^(CONFIDENTIAL|DISCLAIMER|This email)', stripped, re.IGNORECASE):
                continue
            if not stripped and cleaned_lines and not cleaned_lines[-1].strip():
                continue

            cleaned_lines.append(line)

        result = "\n".join(cleaned_lines).strip()
        result = re.sub(r'\n{3,}', '\n\n', result)
        result = re.sub(r' {2,}', ' ', result)
        return result

    def chunk_text(self, text: str, chunk_size: int | None = None, overlap: int | None = None) -> List[str]:
        if not text:
            return []

        chunk_size = chunk_size or CHUNK_SIZE
        overlap = overlap or CHUNK_OVERLAP
        overlap = max(0, min(overlap, chunk_size - 1))

        words = text.split()
        total_words = len(words)
        if total_words <= chunk_size:
            return [text]

        chunks: List[str] = []
        start = 0
        while start < total_words:
            end = min(start + chunk_size, total_words)
            chunk = " ".join(words[start:end])
            chunks.append(chunk)
            if end >= total_words:
                break
            next_start = end - overlap
            if next_start <= start:
                next_start = start + 1
            start = next_start
            if start >= total_words:
                break
        return chunks

    def extract_entities(self, text: str) -> Dict:
        entities: Dict[str, List] = {
            "dates": [],
            "emails": [],
            "people": [],
            "action_items": [],
            "requirements": [],
        }

        date_patterns = [
            r'\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,?\s*\d{4})?\b',
            r'\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{1,2}(?:,?\s*\d{4})?\b',
            r'\b\d{1,2}/\d{1,2}/\d{2,4}\b',
            r'\b\d{4}-\d{2}-\d{2}\b',
            r'\bQ[1-4]\s*\d{4}\b',
            r'\b(?:end of|by end of)\s+(?:week|month|quarter|year|sprint|day)\b',
            r'\b(?:EOD|EOW|EOM)\b',
        ]
        for pattern in date_patterns:
            entities["dates"].extend(re.findall(pattern, text, re.IGNORECASE))

        email_pattern = r'\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b'
        entities["emails"] = list(set(re.findall(email_pattern, text)))

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

        req_pattern = r'(?:^|\. )([^.]*?(?:must|shall|should|need to|required to|requirement)[^.]*\.)'
        entities["requirements"] = [r.strip() for r in re.findall(req_pattern, text, re.MULTILINE | re.IGNORECASE)]

        people_pattern = r'(\b[A-Z][a-z]+(?:\s[A-Z][a-z]+)?)\s*\(([^)]+)\)'
        people_matches = re.findall(people_pattern, text)
        entities["people"] = [{"name": name, "role": role} for name, role in people_matches]

        def dedupe(items: List):
            seen = set()
            out = []
            for item in items:
                key = str(item)
                if key in seen:
                    continue
                seen.add(key)
                out.append(item)
            return out

        entities["dates"] = dedupe(entities["dates"])
        entities["action_items"] = dedupe(entities["action_items"])
        entities["requirements"] = dedupe(entities["requirements"])
        entities["people"] = dedupe(entities["people"])
        return entities


enhancer = IngestionEnhancer()
