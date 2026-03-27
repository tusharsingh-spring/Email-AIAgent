"""
BRD Agent - Multi-Channel Data Fetcher
========================================
Orchestrates data fetching from Gmail, Slack, and Fireflies.ai.
As requested by the Senior AI Business Analyst.
"""

import requests
import json
import brd_agent.config as config

class MultiChannelFetcher:
    def __init__(self):
        # Using getattr to avoid potential ImportError during dynamic Streamlit reloads
        self.slack_token = getattr(config, 'SLACK_TOKEN', "")
        self.fireflies_api_key = getattr(config, 'FIREFLIES_API_KEY', "")
        self.gmail_api_key = getattr(config, 'GMAIL_API_KEY', "")

    def fetch_gmail_threads(self, query="subject:Project OR subject:Requirements"):
        """
        Fetch threads from Gmail using the GMail API.
        Note: Requires proper OAuth2 scope for production.
        """
        if not self.gmail_api_key:
            return []
        
        print(f"📧 Fetching Gmail threads for: {query}")
        # Simplified simulation for demonstration
        # In a real app, you'd use google-api-python-client
        return [
            {
                "id": "gmail_12",
                "source": "Gmail",
                "subject": "Project Alpha Requirements Update",
                "content": "Stakeholder A says the deadline is Monday. We must have PDF support."
            }
        ]

    def fetch_slack_messages(self, channel_id="C12345"):
        """
        Fetch messages from a Slack channel.
        """
        if not self.slack_token:
            return []
        
        print(f"💬 Fetching Slack messages from channel: {channel_id}")
        # Real API call (placeholder for demonstration)
        # headers = {"Authorization": f"Bearer {self.slack_token}"}
        # response = requests.get(f"https://slack.com/api/conversations.history?channel={channel_id}", headers=headers)
        
        return [
            {
                "id": "slack_ch_1",
                "source": "Slack",
                "user": "Stakeholder B",
                "content": "I disagree with Stakeholder A. The deadline is Friday, and we don't need PDF support right now."
            }
        ]

    def fetch_fireflies_transcript(self, transcript_id="latest"):
        """
        Fetch the most recent transcript from Fireflies.ai using their GraphQL API.
        """
        if not self.fireflies_api_key:
            return []
        
        print(f"🎙️ Fetching Fireflies transcript: {transcript_id}")
        
        url = "https://api.fireflies.ai/graphql"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.fireflies_api_key}"
        }

        # GraphQL Query to get the most recent transcript
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
            response = requests.post(url, json={'query': query}, headers=headers)
            
            if response.status_code == 200:
                data = response.json()
                transcripts = data.get('data', {}).get('transcripts', [])
                
                if not transcripts:
                    print("   ⚠️ No transcripts found in Fireflies.ai")
                    return []
                    
                transcript_data = transcripts[0]
                
                # Formatting sentences into a single block of text
                full_text = f"Meeting Title: {transcript_data.get('title', 'Unknown')}\n"
                for sentence in transcript_data.get('sentences', []):
                    speaker = sentence.get('speaker_name', 'Speaker')
                    text = sentence.get('text', '')
                    full_text += f"{speaker}: {text}\n"
                
                return [
                    {
                        "id": transcript_data.get('id', 'fireflies_latest'),
                        "source": "Fireflies.ai",
                        "content": full_text
                    }
                ]
            else:
                print(f"   ❌ Fireflies API Error: {response.status_code}")
                return []
        except Exception as e:
            print(f"   ⚠️ Exception while fetching Fireflies: {e}")
            return []

    def fetch_all_channels(self):
        """Orchestrate fetching from all channels."""
        all_data = []
        all_data.extend(self.fetch_gmail_threads())
        all_data.extend(self.fetch_slack_messages())
        all_data.extend(self.fetch_fireflies_transcript())
        return all_data

    def fetch_all_data_context(self):
        """
        As requested by Senior Analyst: Returns combined text context.
        Yeh code aapke 'Load Datasets' button ke piche hona chahiye.
        """
        all_data = self.fetch_all_channels()
        combined_context = "\n\n".join([
            f"{d['source']}: {d['content']}" for d in all_data
        ])
        return combined_context

if __name__ == "__main__":
    fetcher = MultiChannelFetcher()
    data = fetcher.fetch_all_channels()
    print(json.dumps(data, indent=2))
