"""
Multi-channel fetcher (Gmail, Slack, Fireflies.ai) adapted from BRD Agent.
All calls are safe to run even without credentials; they return empty lists.
"""

import json
import requests
import os

SLACK_TOKEN = os.getenv("SLACK_TOKEN", "")
FIREFLIES_API_KEY = os.getenv("FIREFLIES_API_KEY", "")
GMAIL_API_KEY = os.getenv("GMAIL_API_KEY", "")


class MultiChannelFetcher:
    def __init__(self):
        self.slack_token = SLACK_TOKEN
        self.fireflies_api_key = FIREFLIES_API_KEY
        self.gmail_api_key = GMAIL_API_KEY

    def fetch_gmail_threads(self, query: str = "subject:Project OR subject:Requirements"):
        if not self.gmail_api_key:
            return []
        # Placeholder: in production use google-api-python-client with OAuth2 tokens.
        return [
            {
                "id": "gmail_simulated",
                "source": "Gmail",
                "subject": "Project Alpha Requirements Update",
                "content": "Stakeholder A says the deadline is Monday. We must have PDF support.",
            }
        ]

    def fetch_slack_messages(self, channel_id: str = "C12345"):
        if not self.slack_token:
            return []
        # Example placeholder; real use would call Slack conversations.history.
        return [
            {
                "id": "slack_simulated",
                "source": "Slack",
                "user": "Stakeholder B",
                "content": "I disagree with Stakeholder A. The deadline is Friday, and we don't need PDF support right now.",
            }
        ]

    def fetch_fireflies_transcript(self, transcript_id: str = "latest"):
        if not self.fireflies_api_key:
            return []

        url = "https://api.fireflies.ai/graphql"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.fireflies_api_key}",
        }
        query = """
        {
          transcripts(limit: 1) {
            id
            title
            sentences {
              speaker_name
              text
            }
          }
        }
        """
        try:
            response = requests.post(url, json={"query": query}, headers=headers)
            if response.status_code != 200:
                return []
            data = response.json()
            transcripts = data.get("data", {}).get("transcripts", [])
            if not transcripts:
                return []
            transcript_data = transcripts[0]
            full_text = f"Meeting Title: {transcript_data.get('title', 'Unknown')}\n"
            for sentence in transcript_data.get("sentences", []):
                speaker = sentence.get("speaker_name", "Speaker")
                text = sentence.get("text", "")
                full_text += f"{speaker}: {text}\n"
            return [
                {
                    "id": transcript_data.get("id", "fireflies_latest"),
                    "source": "Fireflies.ai",
                    "content": full_text,
                }
            ]
        except Exception:
            return []

    def fetch_all_channels(self):
        data = []
        data.extend(self.fetch_gmail_threads())
        data.extend(self.fetch_slack_messages())
        data.extend(self.fetch_fireflies_transcript())
        return data

    def fetch_all_data_context(self) -> str:
        all_data = self.fetch_all_channels()
        return "\n\n".join([f"{d['source']}: {d['content']}" for d in all_data])


fetcher = MultiChannelFetcher()
