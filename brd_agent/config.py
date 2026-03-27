"""
BRD Agent - Configuration Module
=================================
Loads environment variables and provides centralized config for all modules.

HOW IT WORKS:
  - Reads .env file using python-dotenv
  - Provides typed config values with sensible defaults
  - All other modules import from here instead of reading .env directly
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# ── Load .env file ──────────────────────────────────────────────────────────
# Look for .env in the project root (parent of brd_agent/)
PROJECT_ROOT = Path(__file__).parent.parent.resolve()
ENV_FILE = PROJECT_ROOT / ".env"
load_dotenv(ENV_FILE)

# ── LLM Configuration ──────────────────────────────────────────────────────
LLM_PROVIDER = os.getenv("LLM_PROVIDER", "groq")  # "gemini", "openai", "together", "groq", "local"
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
TOGETHER_API_KEY = os.getenv("TOGETHER_API_KEY", "")
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
LLM_MODEL = os.getenv("LLM_MODEL", "")  # Empty = use default per provider

# ── Multi-Channel API Configuration ────────────────────────────────────────
SLACK_TOKEN = os.getenv("SLACK_TOKEN", "")
FIREFLIES_API_KEY = os.getenv("FIREFLIES_API_KEY", "")
GMAIL_API_KEY = os.getenv("GMAIL_API_KEY", "")

# Default models per provider
DEFAULT_MODELS = {
    "gemini": "gemini-2.0-flash",
    "openai": "gpt-3.5-turbo",
    "together": "microsoft/Phi-3-mini-4k-instruct",
    "groq": "llama-3.1-8b-instant",
    "local": "Phi-3-mini-4k-instruct",
}

def get_llm_model():
    """Get the LLM model name based on provider and config."""
    if LLM_MODEL:
        return LLM_MODEL
    return DEFAULT_MODELS.get(LLM_PROVIDER, "llama-3.1-8b-instant")

# ── Application Configuration ──────────────────────────────────────────────
SECRET_KEY = os.getenv("SECRET_KEY", "brd-agent-hackathon-secret-key")
DATABASE_URL = os.getenv("DATABASE_URL", f"sqlite:///{PROJECT_ROOT / 'brd_agent.db'}")
MAX_UPLOAD_SIZE_MB = int(os.getenv("MAX_UPLOAD_SIZE_MB", "50"))
DEBUG = os.getenv("DEBUG", "True").lower() == "true"
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "5000"))
STREAMLIT_PORT = int(os.getenv("STREAMLIT_PORT", "8501"))

# ── Directory Paths ────────────────────────────────────────────────────────
DATA_DIR = PROJECT_ROOT / "data"
DATASETS_DIR = DATA_DIR / "datasets"
UPLOADS_DIR = DATA_DIR / "uploads"
DB_DIR = PROJECT_ROOT / "db"

# Dataset-specific directories
ENRON_DIR = DATASETS_DIR / "enron"
AMI_DIR = DATASETS_DIR / "ami"
MEETING_TRANSCRIPTS_DIR = DATASETS_DIR / "meeting_transcripts"

# Create directories if they don't exist
for d in [DATA_DIR, DATASETS_DIR, UPLOADS_DIR, DB_DIR, ENRON_DIR, AMI_DIR, MEETING_TRANSCRIPTS_DIR]:
    d.mkdir(parents=True, exist_ok=True)

# ── Feature Flags ──────────────────────────────────────────────────────────
ENABLE_SPEECH_TO_TEXT = os.getenv("ENABLE_SPEECH_TO_TEXT", "False").lower() == "true"
ENABLE_STAKEHOLDER_GRAPH = os.getenv("ENABLE_STAKEHOLDER_GRAPH", "True").lower() == "true"
ENABLE_CONFLICT_DETECTION = os.getenv("ENABLE_CONFLICT_DETECTION", "True").lower() == "true"
ENABLE_MULTI_TOPIC_CLUSTERING = os.getenv("ENABLE_MULTI_TOPIC_CLUSTERING", "True").lower() == "true"
ENABLE_GROUND_TRUTH_VALIDATION = os.getenv("ENABLE_GROUND_TRUTH_VALIDATION", "True").lower() == "true"

# ── Dataset URLs (for reference/credits) ───────────────────────────────────
DATASET_SOURCES = {
    "enron": {
        "name": "Enron Email Dataset",
        "url": "https://www.kaggle.com/datasets/wcukierski/enron-email-dataset",
        "license": "Public Domain",
        "description": "500,000+ emails from Enron Corporation employees"
    },
    "ami": {
        "name": "AMI Meeting Corpus",
        "url": "https://huggingface.co/datasets/knkarthick/AMI",
        "alt_url": "https://groups.inf.ed.ac.uk/ami/corpus/",
        "license": "CC BY 4.0",
        "description": "Meeting transcripts with human-written summaries"
    },
    "meeting_transcripts": {
        "name": "Meeting Transcripts Dataset",
        "url": "https://www.kaggle.com/datasets/abhishekunnam/meeting-transcripts",
        "license": "Check Kaggle License",
        "description": "Collection of meeting transcripts for NLP tasks"
    }
}

# ── Noise Filtering Configuration ──────────────────────────────────────────
# Keywords that indicate RELEVANT content (requirements-related)
RELEVANCE_KEYWORDS = [
    "requirement", "requirements", "must", "shall", "should", "need",
    "feature", "specification", "deadline", "timeline", "milestone",
    "stakeholder", "decision", "approved", "rejected", "budget",
    "priority", "scope", "deliverable", "objective", "constraint",
    "risk", "dependency", "acceptance criteria", "user story",
    "functional", "non-functional", "integration", "api", "database",
    "security", "performance", "scalability", "compliance", "action item",
    "feedback", "review", "approve", "sign-off", "phase", "sprint"
]

# Keywords that indicate NOISE (irrelevant content)
NOISE_KEYWORDS = [
    "lunch", "newsletter", "happy hour", "birthday", "potluck",
    "parking", "weather", "sports", "fantasy football", "recipe",
    "vacation photos", "joke", "forward:", "fw:", "fyi",
    "out of office", "unsubscribe", "spam", "advertisement",
    "personal", "weekend plans", "social event"
]

# ── Chunking Configuration ─────────────────────────────────────────────────
CHUNK_SIZE = 512          # tokens per chunk for LLM processing
CHUNK_OVERLAP = 50        # overlap between chunks to preserve context
MAX_LLM_INPUT_TOKENS = 4000  # max tokens to send to LLM at once


def print_config():
    """Print current configuration (for debugging)."""
    print("=" * 60)
    print("BRD Agent Configuration")
    print("=" * 60)
    print(f"  LLM Provider:    {LLM_PROVIDER}")
    print(f"  LLM Model:       {get_llm_model()}")
    print(f"  Database:        {DATABASE_URL}")
    print(f"  Project Root:    {PROJECT_ROOT}")
    print(f"  Debug Mode:      {DEBUG}")
    print(f"  API Port:        {PORT}")
    print(f"  Streamlit Port:  {STREAMLIT_PORT}")
    print("=" * 60)


if __name__ == "__main__":
    print_config()
