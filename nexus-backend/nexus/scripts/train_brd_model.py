"""
NEXUS — BRD Fine-Tuning Script
Trains a T5-small model on Enron emails and AMI meeting transcripts 
to extract structured BRD content (functional reqs, stakeholders, decisions).

Usage:
    conda activate ml_gpu
    python scripts/train_brd_model.py

Output:
    models/brd_t5_finetuned/ — use with BRD extraction instead of Groq API
"""

import os, json, re
import torch
from pathlib import Path

# ── Force Torch backend ─────────────────────────────────────────────────────
os.environ["USE_TF"]    = "0"
os.environ["USE_TORCH"] = "1"

from transformers import T5ForConditionalGeneration, T5Tokenizer, TrainingArguments, Trainer
from torch.utils.data import Dataset
from datasets import load_dataset

# ── Config ───────────────────────────────────────────────────────────────────
MODEL_NAME    = "t5-small"          # upgrade to t5-base for better quality
OUTPUT_DIR    = "models/brd_t5_finetuned"
MAX_INPUT_LEN = 512
MAX_TARGET_LEN = 256
BATCH_SIZE    = 4
NUM_EPOCHS    = 3
DEVICE        = "cuda" if torch.cuda.is_available() else "cpu"


# ─────────────────────────────────────────────────────────────────────────────
# DATASET LOADING
# Uses Enron (~10k sample) and AMI meeting corpus
# ─────────────────────────────────────────────────────────────────────────────
def load_enron_samples(n_samples: int = 5000) -> list[dict]:
    """
    Load a sample of the Enron Email Dataset from Kaggle CSV.
    Fall back to synthetic samples if not available.
    """
    csv_path = Path("dataset/enron_emails.csv")
    if csv_path.exists():
        import pandas as pd
        df = pd.read_csv(csv_path, nrows=n_samples)
        samples = []
        for _, row in df.iterrows():
            body = str(row.get('message', '') or '').strip()
            if len(body) < 100:
                continue
            # Heuristic: generate structured BRD fields from email
            sample = {
                "input": f"Extract business requirements from this email:\n\n{body[:450]}",
                "target": build_synthetic_brd_target(body)
            }
            samples.append(sample)
        print(f"[Train] Loaded {len(samples)} Enron email samples.")
        return samples
    else:
        print("[Train] Enron CSV not found at dataset/enron_emails.csv. Using synthetic fallback.")
        return _synthetic_brd_samples()


def load_ami_samples() -> list[dict]:
    """Load AMI meeting corpus. Requires HF_TOKEN for gated dataset."""
    hf_token = os.getenv("HF_TOKEN")
    try:
        ds = load_dataset("knkarthick/AMI", split="train", token=hf_token)
        samples = []
        for item in ds:
            transcript = item.get("dialogue", "") or ""
            summary    = item.get("summary", "") or ""
            if not transcript or len(transcript) < 80:
                continue
            samples.append({
                "input": f"Extract business requirements from this meeting transcript:\n\n{transcript[:450]}",
                "target": f"project_name: Discussed Project | stakeholders: Meeting Participants | decisions_made: {summary[:200]} | functional_requirements: Requirements discussed in meeting."
            })
        print(f"[Train] Loaded {len(samples)} AMI meeting samples.")
        return samples
    except Exception as e:
        print(f"[Train] AMI dataset unavailable ({e}). Skipping.")
        return []


def build_synthetic_brd_target(email_body: str) -> str:
    """
    Generates a structured BRD label from raw email using simple heuristics.
    In production, replace with LLM-annotated ground truth.
    """
    lines = [l.strip() for l in email_body.split('\n') if len(l.strip()) > 20][:5]
    context = " ".join(lines)[:200]
    return (
        f"project_name: Extracted Project | "
        f"stakeholders: Email Participants | "
        f"functional_requirements: FR-001 Implement requested capability. | "
        f"non_functional_requirements: NFR-001 System must be reliable. | "
        f"decisions_made: Decision pending stakeholder input. | "
        f"timelines_milestones: TBD | "
        f"feature_prioritization: P0 Core Capability"
    )


def _synthetic_brd_samples() -> list[dict]:
    """Fallback: hand-crafted BRD training examples."""
    pairs = [
        ("We need to migrate our payment system to Stripe by Q2 for PCI compliance. Budget is $80k.",
         "project_name: Payment Migration | business_problem: Non-compliant payment system | stakeholders: Finance, Engineering | functional_requirements: FR-001 Integrate Stripe API. FR-002 Migrate existing data. | non_functional_requirements: NFR-001 PCI DSS compliance. NFR-002 99.9% uptime. | decisions_made: Stripe selected as provider. Q2 deadline confirmed."),
        ("The client wants an AI chatbot for customer support that can handle 5000 concurrent users.",
         "project_name: AI Customer Support Chatbot | business_problem: High support ticket volume | stakeholders: Client, Dev Team, Support | functional_requirements: FR-001 NLP intent detection. FR-002 Escalation to human agent. | non_functional_requirements: NFR-001 5000 concurrent users. NFR-002 <2s response time. | decisions_made: AI-first approach approved."),
        ("We discussed moving our infrastructure to AWS. Cost reduction is the primary goal — target 30% savings.",
         "project_name: AWS Cloud Migration | business_problem: High on-premise infrastructure costs | stakeholders: CTO, DevOps, Finance | functional_requirements: FR-001 Migrate workloads to EC2/S3. FR-002 Set up CI/CD pipelines. | non_functional_requirements: NFR-001 30% cost reduction. NFR-002 Zero downtime migration. | decisions_made: AWS selected. Migration starts Q1."),
        ("Our mobile app needs user auth with SSO support for enterprise clients. GDPR compliance is mandatory.",
         "project_name: Enterprise SSO Integration | business_problem: No enterprise auth support | stakeholders: Product, Engineering, Legal | functional_requirements: FR-001 SSO via SAML/OAuth. FR-002 Multi-tenant user management. | non_functional_requirements: NFR-001 GDPR compliance. NFR-002 OAuth2 and SAML support. | decisions_made: Auth0 selected as IdP."),
        ("We need to build an internal dashboard to track KPIs across all departments on a real-time basis.",
         "project_name: Internal KPI Dashboard | business_problem: Lack of real-time performance visibility | stakeholders: Leadership, BI Team, Department Heads | functional_requirements: FR-001 Real-time data ingestion. FR-002 Role-based access. | non_functional_requirements: NFR-001 Sub-second dashboard refresh. NFR-002 Role-based data access. | decisions_made: PowerBI + custom API backend selected."),
    ]
    return [{"input": f"Extract business requirements from this email:\n\n{inp}", "target": tgt} for inp, tgt in pairs]


# ─────────────────────────────────────────────────────────────────────────────
# PYTORCH DATASET
# ─────────────────────────────────────────────────────────────────────────────
class BRDDataset(Dataset):
    def __init__(self, samples: list[dict], tokenizer, max_input=512, max_target=256):
        self.samples   = samples
        self.tokenizer = tokenizer
        self.max_input = max_input
        self.max_target = max_target

    def __len__(self): return len(self.samples)

    def __getitem__(self, idx):
        item = self.samples[idx]
        enc = self.tokenizer(
            item["input"], max_length=self.max_input,
            padding="max_length", truncation=True, return_tensors="pt"
        )
        tgt = self.tokenizer(
            item["target"], max_length=self.max_target,
            padding="max_length", truncation=True, return_tensors="pt"
        )
        labels = tgt["input_ids"].squeeze()
        labels[labels == self.tokenizer.pad_token_id] = -100  # mask padding in loss

        return {
            "input_ids":      enc["input_ids"].squeeze(),
            "attention_mask": enc["attention_mask"].squeeze(),
            "labels":         labels,
        }


# ─────────────────────────────────────────────────────────────────────────────
# TRAINING ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────
def main():
    print(f"\n{'='*60}")
    print("NEXUS BRD Fine-Tuning Script")
    print(f"Device: {DEVICE} | Model: {MODEL_NAME}")
    print(f"{'='*60}\n")

    # 1. Load datasets
    enron_samples = load_enron_samples(n_samples=3000)
    ami_samples   = load_ami_samples()
    all_samples   = enron_samples + ami_samples

    if len(all_samples) == 0:
        print("[ERROR] No training data found. Add dataset/enron_emails.csv or set HF_TOKEN.")
        return

    print(f"[Train] Total training samples: {len(all_samples)}")

    # 2. Split 90/10 train/eval — but always keep at least 1 eval sample
    if len(all_samples) >= 10:
        split = int(0.9 * len(all_samples))
    else:
        split = max(len(all_samples) - 1, 1)  # leave at least 1 for eval
    train_data = all_samples[:split]
    eval_data  = all_samples[split:] or all_samples[-1:]  # fallback: reuse last sample

    # 3. Load tokenizer + model
    print(f"[Train] Loading {MODEL_NAME}...")
    tokenizer = T5Tokenizer.from_pretrained(MODEL_NAME)
    model     = T5ForConditionalGeneration.from_pretrained(MODEL_NAME).to(DEVICE)

    # 4. Build datasets
    train_ds = BRDDataset(train_data, tokenizer, MAX_INPUT_LEN, MAX_TARGET_LEN)
    eval_ds  = BRDDataset(eval_data,  tokenizer, MAX_INPUT_LEN, MAX_TARGET_LEN)

    # 5. Training args
    # When the eval set is tiny, skip load_best_model_at_end (it needs eval_loss)
    tiny_eval = len(eval_data) < 4
    args = TrainingArguments(
        output_dir=OUTPUT_DIR,
        num_train_epochs=NUM_EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=max(1, len(eval_data)),
        warmup_steps=min(50, max(1, len(train_data) // 2)),
        weight_decay=0.01,
        logging_dir=None,
        logging_steps=max(1, len(train_data) // BATCH_SIZE),
        eval_strategy="no" if tiny_eval else "epoch",
        save_strategy="no" if tiny_eval else "epoch",
        load_best_model_at_end=False,  # requires eval_loss which tiny datasets don't emit
        fp16=(DEVICE == "cuda"),
        report_to="none",
    )

    # 6. Train!
    trainer = Trainer(
        model=model, args=args,
        train_dataset=train_ds, eval_dataset=eval_ds,
    )
    print("[Train] Starting fine-tuning...")
    trainer.train()

    # 7. Save
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    print(f"\n[Train] ✓ Model saved to: {OUTPUT_DIR}")
    print(f"[Train] To use in production, set GROQ_MODEL=local and update graph.py to call the local model.\n")

    # 8. Quick inference test
    print("[Test] Running quick inference test...")
    model.eval()
    test_input = "Extract business requirements from this email:\n\nWe need a user login system with Google SSO and 2FA by end of Q3. Budget approved: $50k."
    inputs = tokenizer(test_input, return_tensors="pt", max_length=512, truncation=True).to(DEVICE)
    with torch.no_grad():
        out = model.generate(**inputs, max_length=256)
    result = tokenizer.decode(out[0], skip_special_tokens=True)
    print(f"[Test] Input: {test_input[:80]}...")
    print(f"[Test] Predicted BRD: {result}")
    print("\n[Train] Fine-tuning complete! ✓")


if __name__ == "__main__":
    main()
