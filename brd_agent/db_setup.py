"""
BRD Agent - Database Setup Module (Module 3)
=============================================
Handles all database operations using SQLite + SQLAlchemy ORM.

SCHEMA OVERVIEW:
  ┌──────────┐    ┌────────────────┐    ┌─────────────────┐
  │  users   │───▶│ communications │───▶│ brd_extractions │
  └──────────┘    └────────────────┘    └─────────────────┘

TABLES:
  - users:            User sessions and identification
  - communications:   Raw ingested data (emails, transcripts, chats)
  - brd_extractions:  Extracted BRD elements from communications

FEATURES:
  - Full-text search via SQLite FTS5
  - Version tracking for BRD edits
  - Source dataset linking
  - CRUD operations with error handling

HOW TO USE:
  from brd_agent.db_setup import init_database, get_session
  init_database()                    # Create all tables
  session = get_session()            # Get a database session
  insert_communication(session, ...) # Insert data
"""

import json
import datetime
from sqlalchemy import (
    create_engine, Column, Integer, String, Text, DateTime,
    ForeignKey, Float, Index, event, text
)
from sqlalchemy.orm import declarative_base, sessionmaker, relationship
from brd_agent.config import DATABASE_URL, PROJECT_ROOT

# ── SQLAlchemy Setup ────────────────────────────────────────────────────────
# Create the database engine (SQLite is a single file, perfect for hackathons)
engine = create_engine(DATABASE_URL, echo=False)

# Base class for all our database models (tables)
Base = declarative_base()

# Session factory - creates new database sessions
SessionFactory = sessionmaker(bind=engine)


def get_session():
    """
    Get a new database session.

    USAGE:
        session = get_session()
        try:
            # ... do database operations ...
            session.commit()
        except Exception:
            session.rollback()
        finally:
            session.close()
    """
    return SessionFactory()


# ============================================================================
# DATABASE MODELS (Tables)
# ============================================================================

class User(Base):
    """
    Users table - Tracks who uploaded what.

    In a hackathon context, this is simple session tracking.
    In production, you'd add authentication fields.
    """
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False, default="Anonymous")
    email = Column(String(255), unique=True, nullable=True)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    # Relationship: A user can have many communications
    communications = relationship("Communication", back_populates="user")

    def __repr__(self):
        return f"<User(id={self.id}, name='{self.name}')>"

    def to_dict(self):
        return {
            "id": self.id,
            "name": self.name,
            "email": self.email,
            "created_at": self.created_at.isoformat() if self.created_at else None
        }


class Communication(Base):
    """
    Communications table - Stores all raw ingested data.

    Each row is one email, one meeting transcript segment, or one chat message.
    The 'type' column tells us what kind of communication it is.
    The 'source_dataset' column links back to where the data came from.
    """
    __tablename__ = "communications"

    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    type = Column(String(50), nullable=False)  # "email", "meeting", "chat"
    content = Column(Text, nullable=False)       # The actual text content
    subject = Column(String(500), nullable=True) # Email subject or meeting title
    sender = Column(String(255), nullable=True)  # Who sent/said it
    recipients = Column(Text, nullable=True)     # To/CC/BCC as JSON list
    timestamp = Column(DateTime, default=datetime.datetime.utcnow)
    source_dataset = Column(String(100), nullable=True)  # "enron", "ami", "user_upload"
    source_url = Column(String(500), nullable=True)      # Link to dataset
    metadata_json = Column(Text, nullable=True)          # Extra metadata as JSON
    is_noise = Column(Integer, default=0)                # 0 = relevant, 1 = noise
    noise_score = Column(Float, default=0.0)             # 0.0 = fully relevant, 1.0 = pure noise

    # Relationships
    user = relationship("User", back_populates="communications")
    extractions = relationship("BRDExtraction", back_populates="communication")

    # Indexes for fast queries
    __table_args__ = (
        Index("idx_comm_type", "type"),
        Index("idx_comm_timestamp", "timestamp"),
        Index("idx_comm_source", "source_dataset"),
        Index("idx_comm_noise", "is_noise"),
    )

    def __repr__(self):
        return f"<Communication(id={self.id}, type='{self.type}', subject='{self.subject}')>"

    def to_dict(self):
        return {
            "id": self.id,
            "user_id": self.user_id,
            "type": self.type,
            "content": self.content[:200] + "..." if len(self.content) > 200 else self.content,
            "full_content": self.content,
            "subject": self.subject,
            "sender": self.sender,
            "recipients": json.loads(self.recipients) if self.recipients else [],
            "timestamp": self.timestamp.isoformat() if self.timestamp else None,
            "source_dataset": self.source_dataset,
            "source_url": self.source_url,
            "is_noise": bool(self.is_noise),
            "noise_score": self.noise_score
        }


class BRDExtraction(Base):
    """
    BRD Extractions table - Stores extracted BRD elements.

    Each row is one extraction run on a communication (or batch).
    All extracted elements are stored as JSON for flexibility.
    Version tracking allows users to refine extractions.
    """
    __tablename__ = "brd_extractions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    comm_id = Column(Integer, ForeignKey("communications.id"), nullable=True)
    project_topic = Column(String(500), nullable=True)    # Auto-detected topic
    requirements_json = Column(Text, default="[]")         # List of requirements
    decisions_json = Column(Text, default="[]")            # List of decisions
    stakeholders_json = Column(Text, default="[]")         # List of stakeholders
    timelines_json = Column(Text, default="[]")            # List of timeline items
    feedback_json = Column(Text, default="[]")             # List of feedback items
    conflicts_json = Column(Text, default="[]")            # Detected conflicts
    mermaid_code = Column(Text, nullable=True)             # Mermaid.js diagram code
    project_health_score = Column(Integer, default=100)    # Project health (0-100)
    noise_filtered_text = Column(Text, nullable=True)      # Text after noise removal
    raw_llm_output = Column(Text, nullable=True)           # Raw LLM response
    confidence_score = Column(Float, default=0.0)          # 0-1 confidence
    version_num = Column(Integer, default=1)               # Version for edits
    created_at = Column(DateTime, default=datetime.datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow,
                        onupdate=datetime.datetime.utcnow)

    # Relationships
    communication = relationship("Communication", back_populates="extractions")

    # Indexes
    __table_args__ = (
        Index("idx_brd_topic", "project_topic"),
        Index("idx_brd_version", "version_num"),
        Index("idx_brd_created", "created_at"),
    )

    def __repr__(self):
        return f"<BRDExtraction(id={self.id}, topic='{self.project_topic}', v{self.version_num})>"

    def to_dict(self):
        """Convert to dictionary for API responses."""
        return {
            "id": self.id,
            "comm_id": self.comm_id,
            "project_topic": self.project_topic,
            "requirements": json.loads(self.requirements_json) if self.requirements_json else [],
            "decisions": json.loads(self.decisions_json) if self.decisions_json else [],
            "stakeholders": json.loads(self.stakeholders_json) if self.stakeholders_json else [],
            "timelines": json.loads(self.timelines_json) if self.timelines_json else [],
            "feedback": json.loads(self.feedback_json) if self.feedback_json else [],
            "conflicts": json.loads(self.conflicts_json) if self.conflicts_json else [],
            "mermaid_code": self.mermaid_code,
            "project_health_score": self.project_health_score,
            "noise_filtered_text": self.noise_filtered_text,
            "confidence_score": self.confidence_score,
            "version_num": self.version_num,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None
        }


# ============================================================================
# DATABASE INITIALIZATION
# ============================================================================

def init_database():
    """
    Create all tables in the database.

    Call this ONCE when setting up the app for the first time.
    It's safe to call multiple times - it won't destroy existing data.

    USAGE:
        from brd_agent.db_setup import init_database
        init_database()
    """
    print("🗄️ Initializing BRD Agent database...")
    Base.metadata.create_all(engine)

    # Enable FTS5 for full-text search on requirements
    _create_fts_index()

    print("✅ Database initialized successfully!")
    print(f"   Location: {DATABASE_URL}")
    return True


def _create_fts_index():
    """
    Create Full-Text Search index using SQLite FTS5.

    This enables fast text searches across BRD extractions.
    FTS5 is a powerful SQLite extension for full-text search.
    """
    try:
        with engine.connect() as conn:
            # Create FTS5 virtual table for searching BRD content
            conn.execute(text("""
                CREATE VIRTUAL TABLE IF NOT EXISTS brd_search
                USING fts5(
                    project_topic,
                    requirements_text,
                    decisions_text,
                    stakeholders_text,
                    content='brd_extractions',
                    content_rowid='id'
                )
            """))
            conn.commit()
            print("   📝 Full-text search index created.")
    except Exception as e:
        print(f"   ⚠️ FTS5 index note: {e}")


# ============================================================================
# CRUD OPERATIONS (Create, Read, Update, Delete)
# ============================================================================

def insert_communication(session, type, content, subject=None, sender=None,
                         recipients=None, source_dataset=None, source_url=None,
                         user_id=None, metadata=None, is_noise=0, noise_score=0.0):
    """
    Insert a raw communication into the database.

    PARAMS:
        session:        Database session from get_session()
        type:           "email", "meeting", or "chat"
        content:        The actual text content
        subject:        Email subject or meeting title (optional)
        sender:         Who sent it (optional)
        recipients:     List of recipients (optional, stored as JSON)
        source_dataset: "enron", "ami", "meeting_transcripts", "user_upload"
        source_url:     URL to the dataset source
        user_id:        User who uploaded (optional)
        metadata:       Extra metadata dict (optional)
        is_noise:       0 = relevant, 1 = noise
        noise_score:    Float 0.0-1.0 noise level

    RETURNS:
        The created Communication object with its ID

    EXAMPLE:
        session = get_session()
        comm = insert_communication(
            session,
            type="email",
            content="We need the API ready by March 15th...",
            subject="Project Alpha Requirements",
            sender="john@example.com",
            source_dataset="enron"
        )
        print(f"Inserted with ID: {comm.id}")
    """
    comm = Communication(
        user_id=user_id,
        type=type,
        content=content,
        subject=subject,
        sender=sender,
        recipients=json.dumps(recipients) if recipients else None,
        source_dataset=source_dataset,
        source_url=source_url,
        metadata_json=json.dumps(metadata) if metadata else None,
        is_noise=is_noise,
        noise_score=noise_score
    )
    session.add(comm)
    session.commit()
    return comm


def insert_brd_extraction(session, comm_id=None, project_topic=None,
                          requirements=None, decisions=None, stakeholders=None,
                          timelines=None, feedback=None, conflicts=None,
                          mermaid_code=None, project_health_score=100,
                          noise_filtered_text=None, raw_llm_output=None,
                          confidence_score=0.0):
    """
    Insert an extracted BRD into the database.

    PARAMS:
        session:             Database session
        comm_id:             ID of the source communication
        project_topic:       Auto-detected project topic
        requirements:        List of requirement strings
        decisions:           List of decision strings
        stakeholders:        List of stakeholder dicts [{name, role}]
        timelines:           List of timeline dicts [{date, milestone}]
        feedback:            List of feedback strings
        conflicts:           List of conflict dicts [{description, severity}]
        noise_filtered_text: Text after noise removal
        raw_llm_output:      Raw LLM response (for debugging)
        confidence_score:    0.0 - 1.0 confidence score

    RETURNS:
        The created BRDExtraction object with its ID
    """
    # Check if there's an existing extraction for this comm_id to set version
    version = 1
    if comm_id:
        existing = session.query(BRDExtraction).filter_by(
            comm_id=comm_id
        ).order_by(BRDExtraction.version_num.desc()).first()
        if existing:
            version = existing.version_num + 1

    brd = BRDExtraction(
        comm_id=comm_id,
        project_topic=project_topic,
        requirements_json=json.dumps(requirements or []),
        decisions_json=json.dumps(decisions or []),
        stakeholders_json=json.dumps(stakeholders or []),
        timelines_json=json.dumps(timelines or []),
        feedback_json=json.dumps(feedback or []),
        conflicts_json=json.dumps(conflicts or []),
        mermaid_code=mermaid_code,
        project_health_score=project_health_score,
        noise_filtered_text=noise_filtered_text,
        raw_llm_output=raw_llm_output,
        confidence_score=confidence_score,
        version_num=version
    )
    session.add(brd)
    session.commit()

    # Update FTS index
    _update_fts_index(session, brd)

    return brd


def _update_fts_index(session, brd):
    """Update the full-text search index for a BRD extraction."""
    try:
        reqs = json.loads(brd.requirements_json) if brd.requirements_json else []
        decs = json.loads(brd.decisions_json) if brd.decisions_json else []
        stkh = json.loads(brd.stakeholders_json) if brd.stakeholders_json else []

        reqs_text = " | ".join(r if isinstance(r, str) else str(r) for r in reqs)
        decs_text = " | ".join(d if isinstance(d, str) else str(d) for d in decs)
        stkh_text = " | ".join(
            s.get("name", str(s)) if isinstance(s, dict) else str(s) for s in stkh
        )

        with engine.connect() as conn:
            conn.execute(text("""
                INSERT OR REPLACE INTO brd_search(rowid, project_topic, requirements_text,
                                                   decisions_text, stakeholders_text)
                VALUES (:id, :topic, :reqs, :decs, :stkh)
            """), {
                "id": brd.id,
                "topic": brd.project_topic or "",
                "reqs": reqs_text,
                "decs": decs_text,
                "stkh": stkh_text
            })
            conn.commit()
    except Exception as e:
        pass  # FTS is optional enhancement; don't break on failure


def get_communication(session, comm_id):
    """Get a single communication by ID."""
    return session.query(Communication).filter_by(id=comm_id).first()


def get_communications(session, type_filter=None, source_filter=None,
                       exclude_noise=True, limit=100, offset=0):
    """
    Get communications with optional filters.

    PARAMS:
        type_filter:   "email", "meeting", or "chat" (optional)
        source_filter: "enron", "ami", etc. (optional)
        exclude_noise: If True, skip noise-flagged items (default: True)
        limit:         Max results to return (default: 100)
        offset:        Skip first N results (for pagination)

    RETURNS:
        List of Communication objects
    """
    query = session.query(Communication)

    if type_filter:
        query = query.filter(Communication.type == type_filter)
    if source_filter:
        query = query.filter(Communication.source_dataset == source_filter)
    if exclude_noise:
        query = query.filter(Communication.is_noise == 0)

    query = query.order_by(Communication.timestamp.desc())
    return query.offset(offset).limit(limit).all()


def get_brd_extraction(session, brd_id):
    """Get a single BRD extraction by ID."""
    return session.query(BRDExtraction).filter_by(id=brd_id).first()


def get_all_brds(session, limit=100, offset=0):
    """Get all BRD extractions, newest first."""
    return session.query(BRDExtraction).order_by(
        BRDExtraction.created_at.desc()
    ).offset(offset).limit(limit).all()


def search_brds(session, query_text):
    """
    Full-text search across BRD extractions using FTS5.

    PARAMS:
        query_text: Search term (e.g., "API integration deadline")

    RETURNS:
        List of matching BRDExtraction objects
    """
    try:
        with engine.connect() as conn:
            result = conn.execute(text("""
                SELECT rowid FROM brd_search
                WHERE brd_search MATCH :query
                ORDER BY rank
                LIMIT 50
            """), {"query": query_text})
            ids = [row[0] for row in result]

        if ids:
            return session.query(BRDExtraction).filter(
                BRDExtraction.id.in_(ids)
            ).all()
    except Exception as e:
        # Fallback: simple LIKE search
        return session.query(BRDExtraction).filter(
            BRDExtraction.requirements_json.contains(query_text) |
            BRDExtraction.project_topic.contains(query_text)
        ).limit(50).all()

    return []


def get_db_stats(session):
    """Get database statistics for the dashboard."""
    return {
        "total_communications": session.query(Communication).count(),
        "total_emails": session.query(Communication).filter_by(type="email").count(),
        "total_meetings": session.query(Communication).filter_by(type="meeting").count(),
        "total_chats": session.query(Communication).filter_by(type="chat").count(),
        "total_noise_filtered": session.query(Communication).filter_by(is_noise=1).count(),
        "total_brds": session.query(BRDExtraction).count(),
        "total_users": session.query(User).count()
    }


def insert_sample_data(session):
    """
    Insert sample data for testing and demo purposes.

    This creates realistic sample communications to demonstrate the app
    without needing to download the full datasets.
    """
    print("📝 Inserting sample data...")

    # Check or get demo user (avoid UNIQUE constraint error)
    user = session.query(User).filter_by(email="demo@brdagent.com").first()
    if not user:
        user = User(name="Demo User", email="demo@brdagent.com")
        session.add(user)
        session.commit()
        print(f"   👤 Created demo user: {user.email}")
    else:
        print(f"   👤 Using existing demo user: {user.email}")

    # Check if sample data already exists to avoid duplicates
    existing_comm = session.query(Communication).filter_by(source_dataset="sample").first()
    if existing_comm:
        print("   ✅ Sample communications already exist. Skipping insertion.")
        return True

    # Sample email (Enron-style)
    insert_communication(
        session,
        type="email",
        content="""From: john.smith@company.com
To: sarah.jones@company.com, mike.chen@company.com
CC: pm-team@company.com
Subject: RE: Project Alpha - API Requirements Update

Hi Team,

Following our meeting yesterday, I want to confirm the key requirements for the API integration:

1. RESTful API endpoints must support JSON and XML formats
2. Authentication via OAuth 2.0 is mandatory (security requirement from compliance)
3. Response time must be under 200ms for 95th percentile (non-functional requirement)
4. The data migration from legacy system must be completed by March 15, 2026
5. Stakeholder approval needed from VP Engineering before Phase 2 kickoff

Decision: We agreed to use PostgreSQL instead of MongoDB based on Sarah's analysis.

Risk: The third-party vendor (DataCorp) hasn't confirmed their API availability timeline.

Action items:
- Mike: Draft API specification document by Feb 20
- Sarah: Complete security audit by Feb 25
- John: Schedule stakeholder review meeting for March 1

Please flag any concerns by end of week.

Best,
John Smith
Senior Project Manager""",
        subject="RE: Project Alpha - API Requirements Update",
        sender="john.smith@company.com",
        recipients=["sarah.jones@company.com", "mike.chen@company.com"],
        source_dataset="sample",
        user_id=user.id
    )

    # Sample meeting transcript (AMI-style)
    insert_communication(
        session,
        type="meeting",
        content="""Meeting Transcript: Project Beta Sprint Planning
Date: February 15, 2026
Attendees: Alice (Product Owner), Bob (Tech Lead), Carol (Designer), Dave (QA)

Alice: Good morning everyone. Let's review the requirements for Sprint 7. The main focus is the user dashboard redesign.

Bob: I've reviewed the technical requirements. We need to migrate the frontend from jQuery to React. The estimated effort is 3 sprints, not 1 as originally planned.

Carol: The design mockups are ready. I recommend we implement the new color palette first - it's a dependency for all other UI work.

Dave: From a testing perspective, we need automated regression tests before the migration. Currently we have 60% coverage, the requirement is 85%.

Alice: That's a concern. The stakeholder presentation is scheduled for March 10. Can we have a demo-ready version by then?

Bob: We can deliver a partial migration - core dashboard pages only - by March 10. Full migration would be April 15.

Alice: Decision: Let's go with the partial approach. Bob, please update the timeline document.

Carol: One more thing - the accessibility audit flagged 12 issues. WCAG 2.1 AA compliance is a hard requirement from legal.

Dave: I disagree with deprioritizing the performance testing. Last sprint we had 3 production incidents related to slow database queries.

Alice: Valid point, Dave. Let's make performance testing a parallel workstream. Bob, can your team handle both?

Bob: We'll need one additional developer. Budget approval needed from the VP.

Alice: I'll escalate that. Action items: Bob updates timeline, Carol prioritizes accessibility fixes, Dave creates performance test plan.""",
        subject="Project Beta Sprint Planning - Sprint 7",
        sender="alice@company.com",
        recipients=["bob@company.com", "carol@company.com", "dave@company.com"],
        source_dataset="sample"
    )

    # Sample chat messages (Slack-style)
    insert_communication(
        session,
        type="chat",
        content="""#project-gamma channel - Slack Export
[2026-02-14 09:15] @elena: Hey team, quick update on the mobile app requirements
[2026-02-14 09:16] @elena: Client wants offline mode support - this is now a P1 requirement
[2026-02-14 09:17] @frank: That's a big change. We need to rethink the data sync architecture
[2026-02-14 09:18] @elena: Agreed. Timeline is still Q2 launch. Can we make it work?
[2026-02-14 09:20] @grace: I've done offline-first before. We can use SQLite locally + conflict resolution on sync
[2026-02-14 09:21] @frank: What about the real-time notification requirement? Offline mode conflicts with that
[2026-02-14 09:22] @elena: Good catch. Let me check with the stakeholder. This might be a conflict in requirements
[2026-02-14 09:30] @elena: Update: Stakeholder says offline mode takes priority over real-time notifications. Notifications can be batched on reconnect
[2026-02-14 09:31] @frank: Decision noted. I'll update the technical spec
[2026-02-14 09:32] @grace: I'll prototype the offline storage layer by Friday. Need the data schema finalized first though
[2026-02-14 09:33] @elena: @hank can you finalize the schema by Wednesday?
[2026-02-14 09:45] @hank: Will do. Also flagging - the payment integration has a hard deadline of March 1 from the payment provider
[2026-02-14 10:00] @elena: Thanks all. Let's sync again Thursday. I'll send a meeting invite""",
        subject="Project Gamma - Mobile App Requirements",
        sender="elena@company.com",
        recipients=["frank@company.com", "grace@company.com", "hank@company.com"],
        source_dataset="sample"
    )

    # Sample noise email (should be filtered)
    insert_communication(
        session,
        type="email",
        content="""From: social@company.com
To: all-staff@company.com
Subject: Friday Happy Hour + Birthday Celebration!

Hey everyone! 🎉

Don't forget about this Friday's happy hour at The Blue Lounge starting at 5 PM!

We're also celebrating Jake's birthday - cake will be served!

Also, the parking lot on the east side will be closed for maintenance this weekend.

RSVP to this email if you're coming!

- Social Committee""",
        subject="Friday Happy Hour + Birthday Celebration!",
        sender="social@company.com",
        recipients=["all-staff@company.com"],
        source_dataset="sample",
        is_noise=1,
        noise_score=0.95
    )

    print(f"✅ Inserted sample data: 4 communications")
    return True


# ============================================================================
# MAIN - Run this file directly to initialize the database
# ============================================================================
if __name__ == "__main__":
    print("=" * 60)
    print("BRD Agent - Database Setup")
    print("=" * 60)
    init_database()

    # Insert sample data
    session = get_session()
    try:
        insert_sample_data(session)
        stats = get_db_stats(session)
        print(f"\n📊 Database Stats:")
        for key, value in stats.items():
            print(f"   {key}: {value}")
    finally:
        session.close()
