import os
os.environ["USE_TF"] = "NO"
os.environ["USE_TORCH"] = "YES"

import numpy as np
from typing import List, Dict
from .parsers import ParsedDocument

class ProjectClusteringAgent:
    """
    Intelligently clusters noisy, unlabeled emails, transcripts, and chats 
    into cohesive 'Project Buckets' before sending them to the BRD Extractor.
    Uses in-memory PyTorch embedding models.
    """
    
    def __init__(self, model_name: str = "sentence-transformers/all-MiniLM-L6-v2", distance_threshold: float = 0.55):
        try:
            from sentence_transformers import SentenceTransformer
            from sklearn.cluster import AgglomerativeClustering
            import torch
        except ImportError:
            raise RuntimeError("Missing missing dependencies: pip install sentence-transformers scikit-learn numpy torch")

        print(f"[Cluster Agent] Loading embedding model: {model_name}...")
        
        # Check if CUDA (GPU) is available as the user requested PyTorch acceleration
        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[Cluster Agent] Using device: {device}")
        
        self.encoder = SentenceTransformer(model_name, device=device)
        self.distance_threshold = distance_threshold
        
        # We use Agglomerative Clustering because we don't know the exact number of projects in the Enron dump.
        # It clusters automatically based on the distance metric.
        self.cluster_model = AgglomerativeClustering(
            n_clusters=None,
            distance_threshold=self.distance_threshold,
            metric='cosine',
            linkage='average'
        )

    def cluster_documents(self, documents: List[ParsedDocument]) -> Dict[int, List[ParsedDocument]]:
        """
        Embeds the documents and groups them by semantic similarity.
        Returns a dict mapping cluster_id to a list of original parsed documents.
        """
        if not documents:
            return {}
        
        if len(documents) == 1:
            return {0: documents}
            
        print(f"[Cluster Agent] Embedding {len(documents)} documents for segregation over GPU/CPU...")
        texts_to_embed = [doc["clean_text"] for doc in documents]
        
        # Embed all context strings
        embeddings = self.encoder.encode(texts_to_embed, show_progress_bar=False)
        
        print("[Cluster Agent] Mathematically segregating into Project Buckets via Scikit-Learn...")
        
        # Protect against identical strings blowing up the linkage
        try:
            labels = self.cluster_model.fit_predict(embeddings)
        except Exception as e:
            print(f"[Cluster Agent] Clustering error (fallback grouping): {e}")
            return {0: documents} # Dump all in bucket 0 safely
            
        # Group documents by their assigned label
        clusters: Dict[int, List[ParsedDocument]] = {}
        for idx, label in enumerate(labels):
            cluster_id = int(label)
            if cluster_id not in clusters:
                clusters[cluster_id] = []
            clusters[cluster_id].append(documents[idx])
            
        print(f"[Cluster Agent] Successfully identified {len(clusters)} distinct project clusters out of {len(documents)} communications.")
        return clusters

    @staticmethod
    def identify_cluster_theme(cluster_docs: List[ParsedDocument]) -> str:
        """
        Returns a simple heuristic naming for the cluster based on the subjects length/metadata
        In a full LangGraph setup, an LLM would summarize the bucket here.
        """
        subjects = [d["metadata"].get("subject", "") for d in cluster_docs if d["source_type"] == "email"]
        if subjects:
            # Pick longest subject as 'Project Theme' assuming it has most context
            return f"Project: {max(subjects, key=len)}"
        else:
            return f"Project Topic: {cluster_docs[0]['source_type'].capitalize()} Discussion"
