import sys
import os
import asyncio

# Ensure paths align
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.graph import run_agent
from services.docx_generator import generate_docx

DATASET_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "dataset")
RESULTS_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "brd_results")

os.makedirs(RESULTS_DIR, exist_ok=True)

async def process_text_intagent(sample_id: str, subject: str, body: str, sender: str, source_type: str):
    print(f"\n[{source_type}] Processing sample: {sample_id}...")
    
    mock_email = {
        "id": f"{source_type}_{sample_id}",
        "thread_id": f"thread_{sample_id}",
        "sender": sender,
        "subject": subject,
        "body": body,
        "attachments": [],
        "force_intent": "brd"  
    }

    try:
        # Pass mock_email to LangGraph. Thread is empty.
        result = await run_agent(mock_email, [])
        
        brd_final = result.get("brd_final")
        
        if brd_final:
            docx_path = os.path.join(RESULTS_DIR, f"BRD_{source_type}_{sample_id}.docx")
            generate_docx(brd_final, docx_path)
            print(f"[{source_type}] ✅ Success! BRD generated: {docx_path}")
            return True
        else:
            print(f"[{source_type}] ❌ Failed to generate BRD. Output was missing.")
            return False
            
    except Exception as e:
        import traceback
        print(f"[{source_type}] 🚨 Exception running pipeline:")
        traceback.print_exc()
        return False

async def evaluate_ami():
    try:
        from datasets import load_dataset
        print("\nLoading AMI Meeting Corpus from HuggingFace (knkarthick/AMI)...")
        # Load exactly 3 samples to avoid heavy API rate limits
        dataset = load_dataset("knkarthick/AMI", split="train[:3]") 
        
        for i, sample in enumerate(dataset):
            meeting_id = sample.get("meeting_id", f"ami_{i}")
            transcript = sample.get("transcript", "")
            
            subject = f"Transcript for Meeting {meeting_id}"
            body = f"Please draft a BRD based on this meeting discussion:\n\n{transcript[:6000]}"
            
            await process_text_intagent(
                sample_id=meeting_id,
                subject=subject,
                body=body,
                sender="ami_corpus@nexus.ai",
                source_type="AMI"
            )
            # Add small delay for GROQ API rates
            await asyncio.sleep(4)
    except ImportError:
        print("`datasets` library not installed. Please `pip install datasets`.")
    except Exception as e:
        print(f"Failed to evaluate AMI Corpus: {e}")

async def evaluate_enron():
    # Use HuggingFace fallback instead of Kaggle CSV to save huge downloads if file not provided
    enron_csv = os.path.join(DATASET_DIR, "emails.csv")
    if os.path.exists(enron_csv):
        print(f"\nFound local Enron dataset: {enron_csv}")
        try:
            import pandas as pd
            df = pd.read_csv(enron_csv, nrows=500) # Load subset
            
            # Simple heuristic to find emails with enough text
            business_emails = df[df['message'].str.len() > 1000]
            samples = business_emails.head(3)
            
            for i, row in samples.iterrows():
                raw_text = str(row.get('message', ''))
                
                # Basic parsing 
                lines = raw_text.split('\n')
                subject = f"Enron Email {i}"
                sender = "enron_user@enron.com"
                
                for line in lines[:20]:
                    if line.startswith("Subject:"):
                        subject = line.replace("Subject:", "").strip()
                    if line.startswith("From:"):
                        sender = line.replace("From:", "").strip()
                
                body = f"Please extract any business requirements from this thread:\n\n{raw_text[:6000]}"
                
                await process_text_intagent(
                    sample_id=str(i),
                    subject=subject,
                    body=body,
                    sender=sender,
                    source_type="ENRON"
                )
                await asyncio.sleep(4)
        except Exception as e:
            print(f"Error reading local Enron dataset: {e}")
    else:
        print(f"\nLocal Enron dataset not found at {enron_csv}.")
        print("Fallback: Using HuggingFace Enron dataset (brianarbuckle/enron_emails)...")
        try:
            from datasets import load_dataset
            dataset = load_dataset("brianarbuckle/enron_emails", split="train[:50]")
            count = 0
            for i, sample in enumerate(dataset):
                raw_text = sample.get("text", "")
                if len(raw_text) > 800 and "project" in raw_text.lower():
                    # Extract email context roughly
                    lines = raw_text.split('\n')
                    subject = f"Enron HF Email {i}"
                    for line in lines[:20]:
                        if line.startswith("Subject:"):
                            subject = line.replace("Subject:", "").strip()
                    
                    body = f"Please extract BRD context:\n\n{raw_text[:6000]}"
                    await process_text_intagent(str(i), subject, body, "enron@enron.com", "ENRON_HF")
                    count += 1
                    if count >= 3:
                        break
                    await asyncio.sleep(4)
        except Exception as e:
            print(f"HF fallback failed: {e}")

async def main():
    print("==================================================")
    print("   NEXUS BRD Agent — Dataset Evaluation Script    ")
    print("==================================================")
    
    await evaluate_ami()
    await evaluate_enron()
    
    print("\nDataset Evaluation Complete!")
    print(f"Check the `{RESULTS_DIR}` directory for generated BRD docx files.")

if __name__ == "__main__":
    asyncio.run(main())
