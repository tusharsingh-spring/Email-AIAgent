"""
BRD Agent - REST API Module (Module 4)
========================================
Flask-based REST API for all BRD Agent features.

ENDPOINTS:
  POST /api/ingest         - Upload a communication (email/transcript/chat)
  POST /api/process/<id>   - Extract BRD from a stored communication
  POST /api/process-text   - Extract BRD from raw text (no storage)
  GET  /api/brd/<id>       - Get a specific BRD extraction
  GET  /api/brds           - List all BRD extractions (with search)
  GET  /api/communications - List all stored communications
  GET  /api/datasets       - List available dataset sources
  GET  /api/visualize/<id> - Get stakeholder graph JSON
  POST /api/refine/<id>    - AI-refine an existing BRD
  GET  /api/stats          - Database statistics
  GET  /api/health         - Health check

HOW TO RUN:
  python -m brd_agent.api

TEST WITH CURL:
  curl -X POST http://localhost:5000/api/process-text \\
    -H "Content-Type: application/json" \\
    -d '{"text": "We need API by March 15...", "type": "email"}'
"""

import json
from flask import Flask, request, jsonify
from flask_cors import CORS

from brd_agent.config import (
    SECRET_KEY, DEBUG, HOST, PORT, MAX_UPLOAD_SIZE_MB, DATASET_SOURCES
)
from brd_agent.db_setup import (
    init_database, get_session, insert_communication, insert_brd_extraction,
    get_communication, get_communications, get_brd_extraction, get_all_brds,
    search_brds, get_db_stats
)
from brd_agent.backend import BRDExtractionEngine
from brd_agent.visualizations import BRDVisualizer


# ============================================================================
# APP FACTORY
# ============================================================================

def create_app():
    """
    Flask application factory.

    Creates and configures the Flask app with all routes.
    Uses the factory pattern for testability.
    """
    app = Flask(__name__)
    app.config["SECRET_KEY"] = SECRET_KEY
    app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_SIZE_MB * 1024 * 1024

    # Enable CORS for frontend (Streamlit) connections
    CORS(app, resources={r"/api/*": {"origins": "*"}})

    # Initialize the database
    init_database()

    # Initialize extraction engine (shared across requests)
    extraction_engine = BRDExtractionEngine()
    visualizer = BRDVisualizer()

    # ────────────────────────────────────────────────────────────────
    # HEALTH CHECK
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/health", methods=["GET"])
    def health_check():
        """Health check endpoint."""
        return jsonify({
            "status": "healthy",
            "service": "BRD Agent API",
            "version": "1.0.0"
        })

    # ────────────────────────────────────────────────────────────────
    # INGEST ENDPOINT
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/ingest", methods=["POST"])
    def ingest_communication():
        """
        Upload/ingest a communication for processing.

        BODY (JSON):
          {
            "type": "email|meeting|chat",
            "content": "The actual text content...",
            "subject": "Optional subject line",
            "sender": "Optional sender",
            "recipients": ["Optional", "list"],
            "source_dataset": "Optional source name"
          }

        CURL EXAMPLE:
          curl -X POST http://localhost:5000/api/ingest \\
            -H "Content-Type: application/json" \\
            -d '{"type":"email","content":"Meeting notes...","subject":"Sprint Review"}'

        RETURNS:
          {"id": 1, "message": "Communication ingested successfully"}
        """
        data = request.get_json()
        if not data or "content" not in data:
            return jsonify({"error": "Missing 'content' field"}), 400

        content = data["content"]
        comm_type = data.get("type", "email")

        if comm_type not in ("email", "meeting", "chat"):
            return jsonify({"error": "Type must be 'email', 'meeting', or 'chat'"}), 400

        if len(content) < 10:
            return jsonify({"error": "Content too short (min 10 chars)"}), 400

        # Preprocess for noise
        from brd_agent.data_ingest import DataIngestionEngine
        ingest = DataIngestionEngine()
        _, noise_score, is_noise = ingest.preprocess_noise(content)

        session = get_session()
        try:
            comm = insert_communication(
                session,
                type=comm_type,
                content=content,
                subject=data.get("subject"),
                sender=data.get("sender"),
                recipients=data.get("recipients"),
                source_dataset=data.get("source_dataset", "user_upload"),
                source_url=data.get("source_url"),
                is_noise=1 if is_noise else 0,
                noise_score=noise_score
            )
            return jsonify({
                "id": comm.id,
                "message": "Communication ingested successfully",
                "noise_score": noise_score,
                "is_noise": is_noise
            }), 201
        except Exception as e:
            session.rollback()
            return jsonify({"error": str(e)}), 500
        finally:
            session.close()

    # ────────────────────────────────────────────────────────────────
    # PROCESS ENDPOINTS
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/process/<int:comm_id>", methods=["POST"])
    def process_communication(comm_id):
        """
        Extract BRD from a stored communication by ID.

        CURL EXAMPLE:
          curl -X POST http://localhost:5000/api/process/1

        RETURNS:
          Full BRD extraction JSON
        """
        session = get_session()
        try:
            comm = get_communication(session, comm_id)
            if not comm:
                return jsonify({"error": f"Communication {comm_id} not found"}), 404

            # Extract BRD
            brd_result = extraction_engine.extract_brd(
                comm.content, channel_type=comm.type
            )

            # Store extraction
            brd = insert_brd_extraction(
                session,
                comm_id=comm.id,
                project_topic=brd_result.get("project_topic"),
                requirements=brd_result.get("requirements", []),
                decisions=brd_result.get("decisions", []),
                stakeholders=brd_result.get("stakeholders", []),
                timelines=brd_result.get("timelines", []),
                feedback=brd_result.get("feedback", []),
                conflicts=brd_result.get("conflicts", []),
                noise_filtered_text=brd_result.get("raw_filtered_text"),
                raw_llm_output=brd_result.get("raw_llm_output"),
                confidence_score=brd_result.get("confidence_score", 0)
            )

            result = brd.to_dict()
            result["channel_type"] = comm.type
            result["action_items"] = brd_result.get("action_items", [])
            return jsonify(result), 200

        except Exception as e:
            session.rollback()
            return jsonify({"error": str(e)}), 500
        finally:
            session.close()

    @app.route("/api/process-text", methods=["POST"])
    def process_raw_text():
        """
        Extract BRD from raw text without storing in database.

        BODY (JSON):
          {
            "text": "The communication text...",
            "type": "email|meeting|chat" (optional, auto-detected)
          }

        CURL EXAMPLE:
          curl -X POST http://localhost:5000/api/process-text \\
            -H "Content-Type: application/json" \\
            -d '{"text":"We need the API ready by March 15..."}'

        RETURNS:
          Full BRD extraction JSON
        """
        data = request.get_json()
        if not data or "text" not in data:
            return jsonify({"error": "Missing 'text' field"}), 400

        text = data["text"]
        channel_type = data.get("type")

        if len(text) < 10:
            return jsonify({"error": "Text too short (min 10 chars)"}), 400

        try:
            brd_result = extraction_engine.extract_brd(text, channel_type=channel_type)
            return jsonify(brd_result), 200
        except Exception as e:
            return jsonify({"error": str(e)}), 500

    # ────────────────────────────────────────────────────────────────
    # BRD RETRIEVAL ENDPOINTS
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/brd/<int:brd_id>", methods=["GET"])
    def get_brd(brd_id):
        """
        Get a specific BRD extraction by ID.

        CURL EXAMPLE:
          curl http://localhost:5000/api/brd/1
        """
        session = get_session()
        try:
            brd = get_brd_extraction(session, brd_id)
            if not brd:
                return jsonify({"error": f"BRD {brd_id} not found"}), 404
            return jsonify(brd.to_dict()), 200
        finally:
            session.close()

    @app.route("/api/brds", methods=["GET"])
    def list_brds():
        """
        List all BRD extractions with optional search.

        QUERY PARAMS:
          ?search=keyword     - Full-text search
          ?limit=100          - Max results
          ?offset=0           - Pagination offset

        CURL EXAMPLES:
          curl http://localhost:5000/api/brds
          curl http://localhost:5000/api/brds?search=API+integration
        """
        search_query = request.args.get("search")
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))

        session = get_session()
        try:
            if search_query:
                brds = search_brds(session, search_query)
            else:
                brds = get_all_brds(session, limit=limit, offset=offset)

            return jsonify({
                "brds": [b.to_dict() for b in brds],
                "total": len(brds)
            }), 200
        finally:
            session.close()

    # ────────────────────────────────────────────────────────────────
    # COMMUNICATIONS ENDPOINT
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/communications", methods=["GET"])
    def list_communications():
        """
        List all stored communications.

        QUERY PARAMS:
          ?type=email|meeting|chat  - Filter by type
          ?source=enron|ami|sample  - Filter by source
          ?include_noise=false      - Include noise items
          ?limit=100                - Max results
        """
        type_filter = request.args.get("type")
        source_filter = request.args.get("source")
        include_noise = request.args.get("include_noise", "false").lower() == "true"
        limit = int(request.args.get("limit", 100))
        offset = int(request.args.get("offset", 0))

        session = get_session()
        try:
            comms = get_communications(
                session,
                type_filter=type_filter,
                source_filter=source_filter,
                exclude_noise=not include_noise,
                limit=limit,
                offset=offset
            )
            return jsonify({
                "communications": [c.to_dict() for c in comms],
                "total": len(comms)
            }), 200
        finally:
            session.close()

    # ────────────────────────────────────────────────────────────────
    # DATASETS ENDPOINT
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/datasets", methods=["GET"])
    def list_datasets():
        """
        List all available dataset sources with links.

        CURL EXAMPLE:
          curl http://localhost:5000/api/datasets
        """
        return jsonify({
            "datasets": DATASET_SOURCES,
            "total": len(DATASET_SOURCES)
        }), 200

    # ────────────────────────────────────────────────────────────────
    # VISUALIZATION ENDPOINT
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/visualize/<int:brd_id>", methods=["GET"])
    def visualize_brd(brd_id):
        """
        Get stakeholder graph visualization data for a BRD.

        CURL EXAMPLE:
          curl http://localhost:5000/api/visualize/1

        RETURNS:
          {
            "nodes": [...],
            "edges": [...],
            "graph_type": "stakeholder_network"
          }
        """
        session = get_session()
        try:
            brd = get_brd_extraction(session, brd_id)
            if not brd:
                return jsonify({"error": f"BRD {brd_id} not found"}), 404

            brd_data = brd.to_dict()
            graph = visualizer.build_stakeholder_graph(brd_data)
            graph["graph_type"] = "stakeholder_network"
            graph["brd_id"] = brd_id
            return jsonify(graph), 200
        finally:
            session.close()

    # ────────────────────────────────────────────────────────────────
    # REFINEMENT ENDPOINT
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/refine/<int:brd_id>", methods=["POST"])
    def refine_brd(brd_id):
        """
        Refine an existing BRD extraction using AI.

        BODY (JSON):
          {"instruction": "Add more detail to the security requirements"}

        CURL EXAMPLE:
          curl -X POST http://localhost:5000/api/refine/1 \\
            -H "Content-Type: application/json" \\
            -d '{"instruction":"Focus on security requirements"}'
        """
        data = request.get_json()
        if not data or "instruction" not in data:
            return jsonify({"error": "Missing 'instruction' field"}), 400

        session = get_session()
        try:
            brd = get_brd_extraction(session, brd_id)
            if not brd:
                return jsonify({"error": f"BRD {brd_id} not found"}), 404

            current_brd = brd.to_dict()
            refined = extraction_engine.refine_brd(current_brd, data["instruction"])

            # Save as new version
            new_brd = insert_brd_extraction(
                session,
                comm_id=brd.comm_id,
                project_topic=refined.get("project_topic", current_brd.get("project_topic")),
                requirements=refined.get("requirements", []),
                decisions=refined.get("decisions", []),
                stakeholders=refined.get("stakeholders", []),
                timelines=refined.get("timelines", []),
                feedback=refined.get("feedback", []),
                conflicts=refined.get("conflicts", []),
                confidence_score=refined.get("confidence_score", 0)
            )

            result = new_brd.to_dict()
            result["message"] = f"BRD refined (version {new_brd.version_num})"
            return jsonify(result), 200

        except Exception as e:
            session.rollback()
            return jsonify({"error": str(e)}), 500
        finally:
            session.close()

    # ────────────────────────────────────────────────────────────────
    # STATISTICS ENDPOINT
    # ────────────────────────────────────────────────────────────────

    @app.route("/api/stats", methods=["GET"])
    def get_stats():
        """
        Get database statistics.

        CURL EXAMPLE:
          curl http://localhost:5000/api/stats
        """
        session = get_session()
        try:
            stats = get_db_stats(session)
            return jsonify(stats), 200
        finally:
            session.close()

    # ────────────────────────────────────────────────────────────────
    # ERROR HANDLERS
    # ────────────────────────────────────────────────────────────────

    @app.errorhandler(404)
    def not_found(error):
        return jsonify({"error": "Endpoint not found"}), 404

    @app.errorhandler(405)
    def method_not_allowed(error):
        return jsonify({"error": "Method not allowed"}), 405

    @app.errorhandler(413)
    def too_large(error):
        return jsonify({"error": f"File too large (max {MAX_UPLOAD_SIZE_MB}MB)"}), 413

    @app.errorhandler(500)
    def internal_error(error):
        return jsonify({"error": "Internal server error"}), 500

    return app


# ============================================================================
# MAIN - Run the Flask server
# ============================================================================

if __name__ == "__main__":
    print("=" * 60)
    print("🚀 BRD Agent API Server")
    print("=" * 60)
    print(f"   URL: http://{HOST}:{PORT}")
    print(f"   Docs: http://{HOST}:{PORT}/api/health")
    print("=" * 60)

    app = create_app()
    app.run(host=HOST, port=PORT, debug=DEBUG)
