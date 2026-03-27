import requests
import time
import sys

BASE_URL = "http://127.0.0.1:8000"

def log(msg):
    print(f"[TEST] {msg}")

def test_pipeline():
    log("1. Checking connection to backend...")
    try:
        res = requests.get(f"{BASE_URL}/api/stats")
        res.raise_for_status()
        log(f"Backend connected! Stats: {res.json()}")
    except Exception as e:
        log(f"Failed to connect to backend: {e}")
        sys.exit(1)

    log("2. Checking Google Calendar API...")
    try:
        res = requests.get(f"{BASE_URL}/api/calendar/events?days=14")
        res.raise_for_status()
        events = res.json().get("events", [])
        log(f"Calendar API successful! Found {len(events)} events.")
        if events and events[0].get("status") == "error":
            log(f"WARNING: Calendar API disabled. Returned dummy error: {events[0].get('title')}")
    except Exception as e:
        log(f"Calendar API check failed: {e}")

    log("3. Creating a new test Project...")
    try:
        res = requests.post(f"{BASE_URL}/api/projects", json={
            "name": "E2E Pipeline Test",
            "description": "Running an automated integration test on the BRD generator"
        })
        res.raise_for_status()
        project = res.json()
        pid = project.get("id")
        log(f"Project created with ID: {pid}")
    except Exception as e:
        log(f"Project creation failed: {e}")
        sys.exit(1)

    log("4. Uploading sample transcript to project...")
    transcript = "Client wants a new React dashboard with 5 charts. Needs to integrate with Postgres. They are concerned about security. Deadline is next month."
    try:
        files = {'file': ('test_transcript.txt', transcript, 'text/plain')}
        res = requests.post(f"{BASE_URL}/api/projects/{pid}/upload-doc", files=files)
        res.raise_for_status()
        log("Transcript uploaded successfully.")
    except Exception as e:
        log(f"Upload failed: {e}")
        sys.exit(1)

    log("5. Triggering BRD LangGraph pipeline...")
    try:
        res = requests.post(f"{BASE_URL}/api/projects/{pid}/generate-brd")
        res.raise_for_status()
        log(f"Pipeline triggered: {res.json()}")
    except Exception as e:
        log(f"Pipeline trigger failed: {e}")
        sys.exit(1)

    log("6. Polling pipeline status (this may take 15-30 seconds)...")
    while True:
        try:
            res = requests.get(f"{BASE_URL}/api/projects/{pid}/brd/status")
            status = res.json()
            if not status.get("running"):
                log("Pipeline finished!")
                if status.get("has_brd"):
                    log("SUCCESS! BRD was generated.")
                    # Fetch BRD content
                    brd_res = requests.get(f"{BASE_URL}/api/projects/{pid}/brd")
                    brd_data = brd_res.json().get("brd", {})
                    log(f"BRD Title: {brd_data.get('title')}")
                    log(f"Sections generated: {brd_data.get('sections_count')}")
                else:
                    log("WARNING: Pipeline finished but no BRD was found.")
                break
            log("Pipeline running... waiting 3 seconds.")
            time.sleep(3)
        except Exception as e:
            log(f"Polling failed: {e}")
            sys.exit(1)

if __name__ == "__main__":
    test_pipeline()
