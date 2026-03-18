"""
Authentication module for BIS.
Uses SQLite for user storage, JWT for tokens, bcrypt for password hashing.
"""

import os
import sqlite3
import bcrypt
from datetime import datetime, timedelta, timezone
from pathlib import Path
from jose import jwt, JWTError
from fastapi import HTTPException, Depends, Query
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

# --- Config ---
DB_PATH = (Path(__file__).parent / "bis.db").resolve()
JWT_SECRET = os.environ.get("JWT_SECRET", "bis-dev-secret-change-in-production")
JWT_ALGORITHM = "HS256"
DEFAULT_SESSION_MINUTES = 5
GUEST_SESSION_MINUTES = 5

# --- Security scheme ---
security = HTTPBearer(auto_error=False)


def get_db() -> sqlite3.Connection:
    """Get a database connection with row factory. Ensures tables exist."""
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            role TEXT NOT NULL DEFAULT 'user',
            approved INTEGER NOT NULL DEFAULT 0,
            session_minutes INTEGER NOT NULL DEFAULT 5,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    # Add session_minutes column if upgrading from older schema
    try:
        conn.execute("ALTER TABLE users ADD COLUMN session_minutes INTEGER NOT NULL DEFAULT 5")
    except sqlite3.OperationalError:
        pass  # Column already exists
    return conn


# --- User operations ---

def create_user(username: str, password: str) -> dict:
    """Create a new user. First user auto-becomes approved admin."""
    conn = get_db()
    try:
        count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        role = "admin" if count == 0 else "user"
        approved = 1 if count == 0 else 0
        # Admin gets 24h session, regular users get default
        session_min = 1440 if count == 0 else DEFAULT_SESSION_MINUTES

        password_hash = bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        conn.execute(
            "INSERT INTO users (username, password_hash, role, approved, session_minutes) VALUES (?, ?, ?, ?, ?)",
            (username, password_hash, role, approved, session_min)
        )
        conn.commit()

        user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        return dict(user)
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="Username already exists")
    finally:
        conn.close()


def authenticate_user(username: str, password: str) -> dict | None:
    """Verify credentials and return user dict or None."""
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    conn.close()

    if not user or not bcrypt.checkpw(password.encode('utf-8'), user["password_hash"].encode('utf-8')):
        return None
    return dict(user)


def get_user_by_id(user_id: int) -> dict | None:
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None


def list_users(search: str = "") -> list[dict]:
    conn = get_db()
    if search:
        users = conn.execute(
            "SELECT id, username, role, approved, session_minutes, created_at FROM users WHERE username LIKE ?",
            (f"%{search}%",)
        ).fetchall()
    else:
        users = conn.execute(
            "SELECT id, username, role, approved, session_minutes, created_at FROM users"
        ).fetchall()
    conn.close()
    return [dict(u) for u in users]


def set_user_approved(user_id: int, approved: bool) -> dict | None:
    conn = get_db()
    conn.execute("UPDATE users SET approved = ? WHERE id = ?", (1 if approved else 0, user_id))
    conn.commit()
    user = conn.execute("SELECT id, username, role, approved, session_minutes, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None


def set_session_minutes(user_id: int, minutes: int) -> dict | None:
    conn = get_db()
    conn.execute("UPDATE users SET session_minutes = ? WHERE id = ?", (minutes, user_id))
    conn.commit()
    user = conn.execute("SELECT id, username, role, approved, session_minutes, created_at FROM users WHERE id = ?", (user_id,)).fetchone()
    conn.close()
    return dict(user) if user else None


def delete_user(user_id: int) -> bool:
    conn = get_db()
    user = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
    if user and user["role"] == "admin":
        admin_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
        if admin_count <= 1:
            conn.close()
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")

    result = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
    conn.commit()
    conn.close()
    return result.rowcount > 0


# --- JWT operations ---

def create_token(user: dict, expire_minutes: int | None = None) -> str:
    """Create a JWT token with configurable expiry."""
    if expire_minutes is None:
        expire_minutes = user.get("session_minutes", DEFAULT_SESSION_MINUTES)
    expire = datetime.now(timezone.utc) + timedelta(minutes=expire_minutes)
    payload = {
        "sub": str(user["id"]),
        "username": user["username"],
        "role": user["role"],
        "approved": bool(user["approved"]),
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def create_guest_token() -> str:
    """Create a short-lived guest token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=GUEST_SESSION_MINUTES)
    payload = {
        "sub": "guest",
        "username": "guest",
        "role": "guest",
        "approved": True,
        "exp": expire,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT token."""
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")


# --- FastAPI dependencies ---

async def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """Dependency: extract and validate the current user from JWT."""
    if not credentials:
        raise HTTPException(status_code=401, detail="Not authenticated")

    payload = decode_token(credentials.credentials)

    # Guest users don't have a DB record
    if payload.get("sub") == "guest":
        return {"id": 0, "username": "guest", "role": "guest", "approved": 1, "session_minutes": GUEST_SESSION_MINUTES}

    user_id = int(payload["sub"])
    user = get_user_by_id(user_id)

    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if not user["approved"]:
        raise HTTPException(status_code=403, detail="Account pending approval")

    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Dependency: require admin role."""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
