"""
Google OAuth2 — Real token flow. No passwords, no hardcoding.
Scopes: Gmail (read/send) + Calendar (read/write)
"""
import os, json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow, Flow
from google.auth.transport.requests import Request

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
    "https://www.googleapis.com/auth/userinfo.email",
    "openid",
]
CREDS_FILE   = os.getenv("GOOGLE_CREDS_FILE", "credentials.json")
TOKEN_FILE   = os.getenv("TOKEN_FILE", "token.json")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/callback")


def get_auth_url() -> str:
    flow = Flow.from_client_secrets_file(CREDS_FILE, scopes=SCOPES)
    flow.redirect_uri = REDIRECT_URI
    url, _ = flow.authorization_url(access_type="offline", prompt="consent",
                                     include_granted_scopes="true")
    return url


def exchange_code(code: str) -> Credentials:
    flow = Flow.from_client_secrets_file(CREDS_FILE, scopes=SCOPES)
    flow.redirect_uri = REDIRECT_URI
    flow.fetch_token(code=code)
    return flow.credentials


def save_credentials(creds: Credentials):
    with open(TOKEN_FILE, "w") as f:
        f.write(creds.to_json())


def load_credentials() -> Credentials | None:
    if not os.path.exists(TOKEN_FILE):
        return None
    try:
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            save_credentials(creds)
        return creds if creds.valid else None
    except Exception as e:
        print(f"[Auth] Credential error: {e}")
        return None
