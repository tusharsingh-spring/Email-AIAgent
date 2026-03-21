"""
Gmail Service — reads REAL inbox via Gmail API (OAuth2).
Sends REAL emails via Gmail API. No SMTP password.
Handles threading, de-duplication, attachment extraction.
"""
import base64, email as email_lib
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

DISCLAIMER = (
    "\n\n─────────────────────────────────────────\n"
    "Sent by NEXUS — Experimental AI Assistant\n"
    "This message was generated autonomously. "
    "Reply if corrections are needed."
)

_processed = set()   # de-duplication cache


def _svc(creds: Credentials):
    return build("gmail", "v1", credentials=creds, cache_discovery=False)


def get_owner_email(creds: Credentials) -> str:
    svc = _svc(creds)
    return svc.users().getProfile(userId="me").execute().get("emailAddress", "")


def fetch_unread_emails(creds: Credentials, limit: int = 25) -> list[dict]:
    """Fetch real unread emails from Gmail inbox. Skip already-processed IDs."""
    svc     = _svc(creds)
    result  = svc.users().messages().list(
        userId="me", q="is:unread -from:me", maxResults=limit
    ).execute()

    emails = []
    for ref in result.get("messages", []):
        msg_id = ref["id"]
        if msg_id in _processed:
            continue
        try:
            msg      = svc.users().messages().get(
                userId="me", id=msg_id, format="full"
            ).execute()
            headers  = {h["name"]: h["value"]
                        for h in msg["payload"].get("headers", [])}
            body, attachments = _extract_body_and_attachments(svc, msg)

            emails.append({
                "id":          msg_id,
                "thread_id":   msg.get("threadId", msg_id),
                "message_id":  headers.get("Message-ID", ""),
                "sender":      headers.get("From", ""),
                "subject":     headers.get("Subject", "(no subject)"),
                "date":        headers.get("Date", ""),
                "body":        body,
                "snippet":     msg.get("snippet", ""),
                "attachments": attachments,
                "received_at": datetime.utcnow().isoformat(),
            })
        except Exception as e:
            print(f"[Gmail] Error fetching {msg_id}: {e}")

    return emails


def _extract_body_and_attachments(svc, msg: dict) -> tuple[str, list[dict]]:
    """Extract plain text body + attachment contents from Gmail message."""
    body        = ""
    attachments = []

    def walk(payload):
        nonlocal body
        mime = payload.get("mimeType", "")
        data = payload.get("body", {}).get("data")

        if mime == "text/plain" and data:
            body += base64.urlsafe_b64decode(data + "==").decode("utf-8", errors="ignore")
        elif mime.startswith("multipart/"):
            for part in payload.get("parts", []):
                walk(part)
        elif payload.get("body", {}).get("attachmentId"):
            att_id   = payload["body"]["attachmentId"]
            filename = payload.get("filename", "attachment")
            try:
                att_data = svc.users().messages().attachments().get(
                    userId="me", messageId=msg["id"], id=att_id
                ).execute()
                raw = base64.urlsafe_b64decode(att_data["data"] + "==")
                # Try to decode as text (for .txt, .md, .csv transcript files)
                try:
                    text_content = raw.decode("utf-8", errors="ignore")
                    attachments.append({
                        "name":    filename,
                        "type":    mime,
                        "content": text_content[:5000],  # cap at 5k chars
                    })
                except Exception:
                    attachments.append({"name": filename, "type": mime, "content": ""})
            except Exception as e:
                print(f"[Gmail] Attachment error: {e}")

    walk(msg["payload"])
    return body, attachments


def fetch_thread_emails(creds: Credentials, thread_id: str) -> list[dict]:
    """Fetch all emails in a thread for BRD context and summarization."""
    svc    = _svc(creds)
    thread = svc.users().threads().get(
        userId="me", id=thread_id, format="full"
    ).execute()

    result = []
    for msg in thread.get("messages", []):
        headers = {h["name"]: h["value"]
                   for h in msg["payload"].get("headers", [])}
        body, _ = _extract_body_and_attachments(svc, msg)
        result.append({
            "sender":  headers.get("From", ""),
            "date":    headers.get("Date", ""),
            "subject": headers.get("Subject", ""),
            "body":    body,
        })
    return result


def send_email(
    creds:      Credentials,
    to:         list[str],
    subject:    str,
    body:       str,
    thread_id:  str = None,
    message_id: str = None,
    attachment_path: str = None,
) -> dict:
    """
    Send REAL email via Gmail API (OAuth2 — no SMTP password).
    Appends NEXUS disclaimer. Supports threading and file attachment.
    """
    svc    = _svc(creds)
    owner  = svc.users().getProfile(userId="me").execute()["emailAddress"]

    full_body = body + DISCLAIMER

    if attachment_path:
        mime_msg = MIMEMultipart()
        mime_msg.attach(MIMEText(full_body, "plain"))
        with open(attachment_path, "rb") as f:
            part = MIMEBase("application", "octet-stream")
            part.set_payload(f.read())
            encoders.encode_base64(part)
            import os
            part.add_header("Content-Disposition",
                           f"attachment; filename={os.path.basename(attachment_path)}")
            mime_msg.attach(part)
    else:
        mime_msg = MIMEMultipart("alternative")
        mime_msg.attach(MIMEText(full_body, "plain"))

    mime_msg["From"]    = owner
    mime_msg["To"]      = ", ".join(to)
    mime_msg["Subject"] = subject
    if message_id:
        mime_msg["In-Reply-To"] = message_id
        mime_msg["References"]  = message_id

    raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode()
    payload = {"raw": raw}
    if thread_id:
        payload["threadId"] = thread_id

    result = svc.users().messages().send(userId="me", body=payload).execute()
    print(f"[Gmail] Sent to {to} | id={result.get('id')}")
    return result


def mark_read(creds: Credentials, message_id: str):
    try:
        _svc(creds).users().messages().modify(
            userId="me", id=message_id,
            body={"removeLabelIds": ["UNREAD"]}
        ).execute()
        _processed.add(message_id)
    except Exception as e:
        print(f"[Gmail] mark_read error: {e}")
