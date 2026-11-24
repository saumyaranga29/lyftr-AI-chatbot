import os
import sqlite3
import json
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

def get_db_path() -> str:
    db_url = os.environ.get("DATABASE_URL", "sqlite:///./app.db")
    if db_url.startswith("sqlite:////"):
        # e.g., sqlite:////data/app.db -> /data/app.db
        path = "/" + db_url[len("sqlite:////"):]
    elif db_url.startswith("sqlite:///"):
        path = db_url[len("sqlite:///"): ]
    elif db_url.startswith("sqlite://"):
        path = db_url[len("sqlite://"): ]
    else:
        path = db_url

    # Ensure parent directory exists if path has a directory
    parent_dir = os.path.dirname(path)
    if parent_dir and not os.path.exists(parent_dir):
        try:
            os.makedirs(parent_dir, exist_ok=True)
        except OSError:
            pass
    return path

def get_connection() -> sqlite3.Connection:
    path = get_db_path()
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_connection()
    try:
        with conn:
            conn.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                metadata TEXT,
                created_at TEXT NOT NULL
            );
            """)
            conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
            """)
    finally:
        conn.close()

def save_message(session_id: str, role: str, content: str, metadata: Optional[Dict[str, Any]] = None):
    conn = get_connection()
    now_iso = datetime.now(timezone.utc).isoformat()
    meta_json = json.dumps(metadata) if metadata is not None else None
    try:
        with conn:
            conn.execute("""
            INSERT INTO messages (session_id, role, content, metadata, created_at)
            VALUES (?, ?, ?, ?, ?)
            """, (session_id, role, content, meta_json, now_iso))
    finally:
        conn.close()

def get_session_messages(session_id: str) -> Optional[List[Dict[str, Any]]]:
    conn = get_connection()
    try:
        cursor = conn.execute("""
        SELECT role, content, metadata FROM messages
        WHERE session_id = ?
        ORDER BY id ASC
        """, (session_id,))
        rows = cursor.fetchall()
        if not rows:
            return None
        
        result = []
        for row in rows:
            msg = {
                "role": row["role"],
                "content": row["content"]
            }
            if row["metadata"]:
                try:
                    msg["metadata"] = json.loads(row["metadata"])
                except Exception:
                    msg["metadata"] = None
            result.append(msg)
        return result
    finally:
        conn.close()

def check_db_health() -> bool:
    try:
        conn = get_connection()
        conn.execute("SELECT 1;").fetchone()
        conn.close()
        return True
    except Exception:
        return False
