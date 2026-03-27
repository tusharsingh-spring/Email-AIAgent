"""
Lightweight auto-ingest watcher for transcripts, chat logs, and email exports.
Scans INGEST_ROOT periodically, parses files via MultiModalParsers, and attaches
content to Supabase projects (creating them by folder name when needed).
"""
import asyncio
import os
from pathlib import Path
from typing import Callable, Awaitable, Optional

import services.db_service as db_service
from services.parsers import MultiModalParsers

INGEST_ROOT = Path(os.getenv("INGEST_ROOT", "data/ingest")).resolve()
POLL_SECONDS = int(os.getenv("INGEST_POLL_SECONDS", "30"))
SKIP_HINTS = ("enron", "ami", "sample", "dataset")

# Shared state for introspection
seen_paths: set[str] = set()
last_run: Optional[float] = None
last_ingested: list[dict] = []


async def scan_once(
    broadcaster: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> dict:
    """Run a single ingest scan pass; returns stats."""
    global last_run
    INGEST_ROOT.mkdir(parents=True, exist_ok=True)
    added = 0
    errors = 0
    skipped = 0
    for path in INGEST_ROOT.glob("**/*"):
        if path.is_dir():
            continue
        key = str(path.resolve())
        if key in seen_paths:
            continue
        name_lower = path.name.lower()
        if any(hint in name_lower for hint in SKIP_HINTS):
            seen_paths.add(key)
            skipped += 1
            continue

        try:
            raw = path.read_bytes()
            parsed = MultiModalParsers.from_upload(raw, path.name, path.stem)
            project_name = path.parent.name or "Ingested Project"
            project = db_service.get_project_by_name(project_name)
            if not project:
                project = db_service.create_project(project_name, f"Auto-ingested from {path.name}")
            project_id = project.get("id")
            if not project_id:
                seen_paths.add(key)
                continue

            doc_type = parsed.get("source_type", "document")
            db_service.add_document(project_id, path.name, parsed.get("clean_text", ""), doc_type)
            seen_paths.add(key)
            added += 1
            last_ingested.append({"project_id": project_id, "project_name": project_name, "filename": path.name, "doc_type": doc_type})
            if broadcaster:
                await broadcaster({
                    "type": "log",
                    "level": "info",
                    "msg": f"Ingested {path.name} → project {project_name} ({doc_type})",
                })
        except Exception as ingest_err:
            errors += 1
            seen_paths.add(key)
            if broadcaster:
                await broadcaster({"type": "log", "level": "error", "msg": f"Auto-ingest failed for {path.name}: {ingest_err}"})
            continue
    last_run = asyncio.get_event_loop().time()
    return {"added": added, "errors": errors, "skipped": skipped, "seen": len(seen_paths)}


def ingest_status() -> dict:
    return {
        "root": str(INGEST_ROOT),
        "poll_seconds": POLL_SECONDS,
        "seen": len(seen_paths),
        "last_run": last_run,
        "last_ingested": last_ingested[-5:],
    }


async def auto_ingest_loop(
    broadcaster: Optional[Callable[[dict], Awaitable[None]]] = None,
) -> None:
    """Continuously watch the ingest folder and push parsed content into Supabase."""
    if broadcaster:
        await broadcaster({"type": "log", "level": "info", "msg": f"Auto-ingest watching {INGEST_ROOT}"})

    while True:
        try:
            await scan_once(broadcaster)
        except Exception as loop_err:
            if broadcaster:
                await broadcaster({"type": "log", "level": "error", "msg": f"Auto-ingest loop error: {loop_err}"})
        await asyncio.sleep(POLL_SECONDS)
