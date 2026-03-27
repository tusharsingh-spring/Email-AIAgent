"""
BRD Agent - Multi-Channel Requirements Generator
=================================================
A hackathon-winning app that extracts Business Requirements Documents (BRDs)
from noisy emails, meeting transcripts, and chat messages using LLM intelligence.

Core Components:
  • CrossChannelSynthesis - Main orchestrator for multi-channel synthesis
  • BRDExtractionEngine - LLM-based extraction with multi-provider support
  • DataIngestionEngine - Load from Enron, AMI, and custom sources
  • Advanced features: Noise filtering, conflict detection, stakeholder analysis
"""

__version__ = "1.0.0"
__author__ = "BRD Agent Team"

# Import main classes for easy access
try:
    from brd_agent.cross_channel_synthesis import CrossChannelSynthesis
    from brd_agent.backend import BRDExtractionEngine, quick_extract
    from brd_agent.data_ingest import DataIngestionEngine
    
    __all__ = [
        "CrossChannelSynthesis",
        "BRDExtractionEngine",
        "DataIngestionEngine",
        "quick_extract",
    ]
except ImportError:
    # Graceful fallback if dependencies not installed
    __all__ = []
