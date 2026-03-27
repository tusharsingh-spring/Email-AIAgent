"""
NEXUS — Multi-Modal Document Parsers
Converts emails, meeting transcripts, chat logs, and PDFs 
into a standardised structure for NLP clustering and BRD extraction.
"""
import re
import io
from typing import TypedDict, Optional


class ParsedDocument(TypedDict):
    doc_id: str
    source_type: str     # 'email' | 'meeting' | 'chat' | 'pdf' | 'plaintext'
    clean_text: str
    original_text: str
    metadata: dict


class MultiModalParsers:
    """
    Parses various noisy communication types into a standard structure
    suitable for NLP clustering and BRD extraction.
    """

    @staticmethod
    def parse_enron_email(raw_text: str, doc_id: str) -> ParsedDocument:
        """
        Cleans Enron-style emails by stripping forwarding headers, basic greetings,
        and legal disclaimers, isolating the actual business context.
        """
        lines = raw_text.split('\n')
        clean_lines = []
        in_signature = False

        subject = "Unknown"
        sender  = "Unknown"

        for line in lines:
            if line.startswith("Subject:"):
                subject = line.replace("Subject:", "").strip()
            elif line.startswith("From:"):
                sender = line.replace("From:", "").strip()
            elif line.startswith("X-"):
                continue
            elif "To:" in line[:5] or "Cc:" in line[:5]:
                continue
            elif "--" in line or "Original Message" in line:
                if len(clean_lines) > 2:
                    in_signature = True

            if not in_signature and line.strip():
                clean_lines.append(line.strip())

        clean_text = " ".join(clean_lines)
        clean_text = re.sub(r'\s+', ' ', clean_text)

        return {
            "doc_id":        doc_id,
            "source_type":   "email",
            "clean_text":    clean_text[:4000],
            "original_text": raw_text,
            "metadata":      {"subject": subject, "sender": sender},
        }

    @staticmethod
    def parse_ami_meeting(transcript: str, meeting_id: str, summary: str = "") -> ParsedDocument:
        """
        Structures AMI meeting transcripts by stripping timestamps and noise,
        preserving speaker utterances for BRD extraction.
        """
        # Remove [timestamp] notation
        clean_text = re.sub(r'\[.*?\]', '', transcript)
        # Remove speaker IDs like "PM:" at the start of lines
        clean_text = re.sub(r'^[A-Z_]+:\s*', '', clean_text, flags=re.MULTILINE)
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()

        return {
            "doc_id":        meeting_id,
            "source_type":   "meeting",
            "clean_text":    f"Meeting Discussion: {clean_text[:4000]}",
            "original_text": transcript,
            "metadata":      {"summary": summary},
        }

    @staticmethod
    def parse_chat(chat_log: str, chat_id: str) -> ParsedDocument:
        """
        Structures Slack / Teams / WhatsApp chat logs.
        Strips timestamps, normalises speaker turns.
        """
        # Remove common timestamp patterns: [10:42], 10:42 AM, etc.
        clean_text = re.sub(r'\[?\d{1,2}:\d{2}(?::\d{2})?(?:\s?[AP]M)?\]?', '', chat_log)
        clean_text = re.sub(r'\s+', ' ', clean_text).strip()

        return {
            "doc_id":        chat_id,
            "source_type":   "chat",
            "clean_text":    f"Chat log: {clean_text[:4000]}",
            "original_text": chat_log,
            "metadata":      {},
        }

    @staticmethod
    def parse_plaintext(text: str, doc_id: str, source_hint: str = "plaintext") -> ParsedDocument:
        """
        Generic parser for plain .txt or .md files uploaded by the user.
        Auto-detects whether it looks like a transcript, email, or raw spec.
        """
        clean_text = re.sub(r'\s+', ' ', text).strip()

        # Heuristic source detection
        if re.search(r'\[\d{1,2}:\d{2}\]|\bPM\b.*:|\bCTO\b.*:', text):
            return MultiModalParsers.parse_chat(text, doc_id)
        elif re.search(r'^Subject:|^From:|forward', text, re.I | re.M):
            return MultiModalParsers.parse_enron_email(text, doc_id)
        elif re.search(r'transcript|meeting|attendee|speaker|agenda', text[:300], re.I):
            return MultiModalParsers.parse_ami_meeting(text, doc_id)

        return {
            "doc_id":        doc_id,
            "source_type":   source_hint,
            "clean_text":    clean_text[:4000],
            "original_text": text,
            "metadata":      {},
        }

    @staticmethod
    def parse_pdf_bytes(pdf_bytes: bytes, doc_id: str) -> ParsedDocument:
        """
        Extracts text from a PDF file (uploaded via dashboard).
        Falls back gracefully if pypdf is not installed.
        """
        try:
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(pdf_bytes))
            pages_text = []
            for page in reader.pages:
                try:
                    pages_text.append(page.extract_text() or "")
                except Exception:
                    pass
            raw_text = "\n".join(pages_text)
            clean_text = re.sub(r'\s+', ' ', raw_text).strip()
            return {
                "doc_id":        doc_id,
                "source_type":   "pdf",
                "clean_text":    clean_text[:4000],
                "original_text": raw_text,
                "metadata":      {"pages": len(reader.pages)},
            }
        except ImportError:
            return {
                "doc_id":        doc_id,
                "source_type":   "pdf",
                "clean_text":    "[PDF parsing unavailable — install pypdf: pip install pypdf]",
                "original_text": "",
                "metadata":      {"error": "pypdf not installed"},
            }
        except Exception as e:
            return {
                "doc_id":        doc_id,
                "source_type":   "pdf",
                "clean_text":    f"[PDF parse error: {e}]",
                "original_text": "",
                "metadata":      {"error": str(e)},
            }

    @staticmethod
    def from_upload(content: bytes, filename: str, doc_id: str) -> ParsedDocument:
        """
        Dispatcher: right parser based on file extension.
        Supports .txt, .md, .csv, .pdf
        """
        ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else "txt"

        if ext == "pdf":
            return MultiModalParsers.parse_pdf_bytes(content, doc_id)

        # Treat everything else as text
        try:
            text = content.decode("utf-8", errors="replace")
        except Exception:
            text = str(content)

        if ext == "csv":
            # Treat CSV as a flat text dump — good for Enron-style CSV exports
            lines = text.split('\n')
            # Skip CSV header, join body column if it looks like an email dataset
            email_rows = []
            for line in lines[1:]:
                cols = line.split(',', 1)
                if len(cols) > 1 and len(cols[1]) > 40:
                    email_rows.append(cols[1].strip().strip('"'))
                if len(email_rows) >= 10:
                    break
            text = "\n\n---\n\n".join(email_rows) if email_rows else text

        return MultiModalParsers.parse_plaintext(text, doc_id, source_hint=ext)
