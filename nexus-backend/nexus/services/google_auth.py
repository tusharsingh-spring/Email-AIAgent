"""
Google OAuth2 — Real token flow. No passwords, no hardcoding.
Scopes: Gmail (read/send) + Calendar (read/write)
"""
import os, json
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import Flow
from google.auth.transport.requests import Request
from urllib.parse import urlparse, urlunparse

SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar",
]
CREDS_FILE   = os.getenv("GOOGLE_CREDS_FILE", "credentials.json")
TOKEN_FILE   = os.getenv("TOKEN_FILE", "token.json")
REDIRECT_URI = os.getenv("REDIRECT_URI", "http://localhost:8000/auth/callback")
_oauth_state = None
_pkce_by_state: dict[str, str] = {}


def _load_client_config() -> tuple[str, dict]:
    with open(CREDS_FILE, "r", encoding="utf-8") as f:
        config = json.load(f)
    if "installed" in config:
        return "installed", config["installed"]
    if "web" in config:
        return "web", config["web"]
    raise RuntimeError("Invalid Google OAuth credentials format")


def _build_flow(scopes: list[str], state: str | None = None) -> Flow:
    client_type, client_cfg = _load_client_config()
    # Normalize endpoints to Google's current OAuth endpoints.
    normalized = dict(client_cfg)
    normalized["auth_uri"] = "https://accounts.google.com/o/oauth2/v2/auth"
    normalized["token_uri"] = "https://oauth2.googleapis.com/token"
    payload = {client_type: normalized}
    return Flow.from_client_config(payload, scopes=scopes, state=state)


def _resolve_redirect_uri() -> str:
    client_type, client_cfg = _load_client_config()
    allowed = client_cfg.get("redirect_uris", []) or []
    configured = REDIRECT_URI.strip()

    if configured and configured in allowed:
        return configured

    parsed = urlparse(configured) if configured else None
    if client_type == "installed" and parsed and parsed.hostname in ("localhost", "127.0.0.1"):
        # Keep configured callback path (e.g. /auth/callback) for FastAPI route handling.
        # Google Desktop clients allow loopback redirect URIs.
        return configured

    if allowed:
        return allowed[0]
    return configured or "http://localhost:8000/auth/callback"


def get_auth_url() -> str:
    global _oauth_state
    flow = _build_flow(SCOPES)
    flow.redirect_uri = _resolve_redirect_uri()
    # Keep the request minimal to avoid strict parameter validation failures.
    url, state = flow.authorization_url(access_type="offline", prompt="consent")
    _oauth_state = state
    # Persist PKCE verifier for callback token exchange.
    if state and getattr(flow, "code_verifier", None):
        _pkce_by_state[state] = flow.code_verifier
    return url


def exchange_code(code: str, state: str | None = None) -> Credentials:
    resolved_state = state or _oauth_state
    flow = _build_flow(SCOPES, state=resolved_state)
    flow.redirect_uri = _resolve_redirect_uri()
    verifier = _pkce_by_state.pop(resolved_state, None) if resolved_state else None
    if verifier:
        flow.code_verifier = verifier
    flow.fetch_token(code=code)
    return flow.credentials


def save_credentials(creds: Credentials):
    with open(TOKEN_FILE, "w", encoding="utf-8") as f:
        f.write(creds.to_json())


def load_credentials() -> Credentials | None:
    if not os.path.exists(TOKEN_FILE):
        return None
    try:
        # Auto-recover from interrupted writes that leave empty JSON files.
        if os.path.getsize(TOKEN_FILE) == 0:
            os.remove(TOKEN_FILE)
            return None
        creds = Credentials.from_authorized_user_file(TOKEN_FILE, SCOPES)
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
            save_credentials(creds)
        return creds if creds.valid else None
    except Exception as e:
        print(f"[Auth] Credential error: {e}")
        try:
            os.remove(TOKEN_FILE)
        except Exception:
            pass
        return None
