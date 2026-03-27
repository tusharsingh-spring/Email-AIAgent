import sys
import os
import asyncio
import json

# Ensure paths align
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.parsers import MultiModalParsers
from services.clustering_service import ProjectClusteringAgent
from agents.graph import run_agent

DATASET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset")

async def gather_noisy_communications():
    print("--- Gathering Initial Communications Batch (Simulated Inbox) ---")
    documents = []

    # 1. Gather a couple of AMI transcripts (simulating meetings)
    try:
        from datasets import load_dataset
        dataset = load_dataset("knkarthick/AMI", split="train[:2]")
        for i, sample in enumerate(dataset):
            meeting_id = sample.get("meeting_id", f"ami_{i}")
            transcript = sample.get("transcript", "")
            
            # Use MultiModalParser for Meeting
            parsed_doc = MultiModalParsers.parse_ami_meeting(transcript, meeting_id, sample.get("summary", ""))
            documents.append(parsed_doc)
            print(f"Ingested AMI Meeting: {meeting_id}")
    except Exception as e:
        print(f"Skipping AMI: {e}")

    # 2. Add some custom simulated Chat Data for testing multi-modal capabilities
    chat_log = "09:00 PM: We need to rewrite the authentication service using OAuth2.\n09:05 Alice: Yes, let's make it Priority 0.\n09:10 Bob: It must handle 50k QPS."
    parsed_chat = MultiModalParsers.parse_chat(chat_log, "slack_thread_872")
    documents.append(parsed_chat)
    print("Ingested Simulated Chat Log")

    # 3. Gather typical Enron business emails
    enron_csv = os.path.join(DATASET_DIR, "emails.csv")
    if os.path.exists(enron_csv):
        import pandas as pd
        try:
            df = pd.read_csv(enron_csv, nrows=600)
            business_emails = df[df['message'].str.len() > 800].head(4)
            for i, row in business_emails.iterrows():
                raw_text = str(row.get('message', ''))
                parsed_email = MultiModalParsers.parse_enron_email(raw_text, f"enron_{i}")
                documents.append(parsed_email)
                print(f"Ingested Enron Email: enron_{i}")
        except Exception as e:
            print(f"Enron CSV error: {e}")
    else:
        # Provide some dummy emails if the dataset is missing
        print("Enron dataset missing. Using fallback simulated emails.")
        e1 = "Subject: Re: Website Design\nFrom: x@y.com\nLet's ensure the landing page uses React."
        e2 = "Subject: Q1 Budget Meeting\nFrom: cfo@y.com\nThe financial review is scheduled for Tuesday."
        documents.append(MultiModalParsers.parse_enron_email(e1, "demo_enron_1"))
        documents.append(MultiModalParsers.parse_enron_email(e2, "demo_enron_2"))

    return documents

async def main():
    print("=========================================================")
    print("  NEXUS: LangGraph Segregation & Clustering Agent Test   ")
    print("=========================================================")
    
    # 1. Multi-Modal Ingestion
    documents = await gather_noisy_communications()
    print(f"\nTotal raw communications parsed: {len(documents)}\n")

    if not documents:
        print("No documents found to process.")
        return

    # 2. Vectorization & In-Memory Clustering via Scikit-Learn
    clustering_agent = ProjectClusteringAgent(distance_threshold=0.6)
    clusters = clustering_agent.cluster_documents(documents)
    
    # 3. Present Results & Pass to LangGraph BRD
    print("\n================== CLUSTER RESULTS ======================")
    for cluster_id, docs in clusters.items():
        theme = ProjectClusteringAgent.identify_cluster_theme(docs)
        print(f"\n[Cluster {cluster_id}] Theme: {theme} (Contains {len(docs)} documents)")
        for d in docs:
            snippet = d['clean_text'][:60].replace('\n', ' ')
            print(f"   ↳ {d['source_type'].upper()} ({d['doc_id']}): {snippet}...")
            
        # Run through LangGraph to physically BUILD the BRDs for each clustered project!
        print(f"   ► Action: Routing bucket directly to LangGraph BRD Extractor...")
        composite_body = "\n\n".join([d['clean_text'] for d in docs])
        mock_email = {
            "id": f"cluster_{cluster_id}",
            "thread_id": f"thread_cluster_{cluster_id}",
            "sender": "segregation_agent@nexus.ai",
            "subject": theme,
            "body": composite_body,
            "attachments": [],
            "force_intent": "brd"
        }
        
        try:
            result = await run_agent(mock_email, [])
            brd_final = result.get("brd_final")
            from services.docx_generator import generate_docx
            import os
            
            RESULTS_DIR = os.path.join(DATASET_DIR, "..", "brd_results")
            os.makedirs(RESULTS_DIR, exist_ok=True)
            
            if brd_final:
                docx_path = os.path.join(RESULTS_DIR, f"BRD_{theme.replace(' ', '_').replace(':', '')}_{cluster_id}.docx")
                generate_docx(brd_final, docx_path)
                print(f"   ► Action: ✅ Success! Clustered BRD DOCX generated: {docx_path}")
            else:
                print(f"   ► Action: ❌ Failed to generate BRD output.")
        except Exception as e:
            print(f"   ► Action: 🚨 Exception during LangGraph extraction: {e}")
        
    print("\nSegregation Test completed. Raw data structured successfully.")

if __name__ == "__main__":
    asyncio.run(main())
