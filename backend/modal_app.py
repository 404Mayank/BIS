"""
BIS — Blister Inspection System (Modal Serverless Backend)

Architecture:
  - CPU container: FastAPI + WebSocket (auth, API, file ops)
  - GPU container: YOLO inference on T4
  - Modal Volume: persistent storage for models + SQLite DB

Cost: $0 when idle (both scale to zero).
"""

import modal

# ---------------------------------------------------------------------------
# Modal App + Volume
# ---------------------------------------------------------------------------
app = modal.App("bis-backend")

vol = modal.Volume.from_name("bis-storage", create_if_missing=True)
DATA_MOUNT = "/data"
MODELS_DIR = f"{DATA_MOUNT}/models"
DB_PATH = f"{DATA_MOUNT}/bis.db"

# ---------------------------------------------------------------------------
# Images
# ---------------------------------------------------------------------------
gpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "ultralytics",
        "opencv-python-headless",
        "numpy",
    )
)

cpu_image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install(
        "fastapi",
        "uvicorn",
        "bcrypt",
        "python-jose[cryptography]",
        "python-multipart",
        "websockets",
        "numpy",
    )
)

# ---------------------------------------------------------------------------
# GPU Inference Function (NVIDIA T4)
# ---------------------------------------------------------------------------
@app.function(
    gpu="T4",
    image=gpu_image,
    volumes={DATA_MOUNT: vol},
    timeout=120,
    scaledown_window=120,  # stay warm 2 min after last call
)
def run_inference(model_id: str, frame_bytes: bytes, conf: float, action: str) -> dict:
    """Run YOLO inference on a single frame. Called from the CPU web server."""
    import cv2
    import numpy as np
    from ultralytics import YOLO
    from pathlib import Path

    # --- Model cache (persists across calls while container is warm) ---
    if not hasattr(run_inference, "_model_cache"):
        run_inference._model_cache = {}

    cache = run_inference._model_cache
    model_path = Path(MODELS_DIR) / f"{model_id}.pt"

    if not model_path.exists():
        vol.reload()  # in case it was just uploaded
        if not model_path.exists():
            return {"error": f"Model {model_id} not found"}

    if model_id not in cache:
        print(f"[GPU] Loading model {model_id} from {model_path}")
        cache[model_id] = YOLO(str(model_path))

    model = cache[model_id]

    # --- Decode frame ---
    nparr = np.frombuffer(frame_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    if img is None:
        return {"error": "Failed to decode frame"}

    # --- Letterbox to 768 ---
    TARGET_SIZE = 768
    h, w = img.shape[:2]
    scale = TARGET_SIZE / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)
    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)
    pad_w = (TARGET_SIZE - new_w) // 2
    pad_h = (TARGET_SIZE - new_h) // 2
    padded = cv2.copyMakeBorder(
        resized, pad_h, TARGET_SIZE - new_h - pad_h,
        pad_w, TARGET_SIZE - new_w - pad_w,
        cv2.BORDER_CONSTANT, value=(114, 114, 114),
    )

    # --- Inference ---
    results = model(padded, conf=conf, verbose=False)
    speed = results[0].speed
    inf_time = speed["inference"]

    # --- Format detections ---
    detections = []
    result = results[0]
    boxes = result.boxes
    names = result.names
    masks = result.masks

    if boxes is not None:
        for i, box in enumerate(boxes):
            xywhn = box.xywhn[0].cpu().numpy().tolist()
            cls_id = int(box.cls[0].item())
            conf_val = float(box.conf[0].item())
            det = {
                "class": names[cls_id],
                "confidence": conf_val,
                "bbox": xywhn,
            }
            if masks is not None and i < len(masks.xyn):
                polygon = masks.xyn[i].tolist()
                if len(polygon) > 50:
                    step = max(1, len(polygon) // 50)
                    polygon = polygon[::step]
                det["segments"] = polygon
            detections.append(det)

    response = {"detections": detections, "inference_time": inf_time}

    if action == "capture":
        class_counts = {}
        for d in detections:
            cls = d["class"]
            class_counts[cls] = class_counts.get(cls, 0) + 1
        response["action"] = "capture_result"
        response["summary"] = class_counts
        response["total"] = len(detections)

    return response


# ---------------------------------------------------------------------------
# CPU Web Server (FastAPI + WebSocket)
# ---------------------------------------------------------------------------
@app.function(
    image=cpu_image,
    cpu=1.0,
    memory=1024,
    volumes={DATA_MOUNT: vol},
    scaledown_window=300,  # 5 min keep-warm
    secrets=[modal.Secret.from_name("bis-secrets")],
)
@modal.concurrent(max_inputs=100)
@modal.asgi_app()
def web_app():
    """FastAPI ASGI app with WebSocket support."""
    import os
    import base64
    from pathlib import Path
    from fastapi import (
        FastAPI, WebSocket, WebSocketDisconnect,
        UploadFile, File, HTTPException, Depends, Query,
    )
    from fastapi.middleware.cors import CORSMiddleware
    from fastapi.responses import JSONResponse
    from pydantic import BaseModel

    # ---- Auth module (inline to avoid import issues in Modal) ----
    import sqlite3
    import bcrypt as _bcrypt
    from datetime import datetime, timedelta, timezone
    from jose import jwt, JWTError
    from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials

    JWT_SECRET = os.environ.get("JWT_SECRET", "bis-dev-secret-change-in-production")
    JWT_ALGORITHM = "HS256"
    DEFAULT_SESSION_MINUTES = 60 * 24
    GUEST_SESSION_MINUTES = 5

    security = HTTPBearer(auto_error=False)

    def get_db() -> sqlite3.Connection:
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                role TEXT NOT NULL DEFAULT 'user',
                approved INTEGER NOT NULL DEFAULT 0,
                session_minutes INTEGER NOT NULL DEFAULT 1440,
                created_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        """)
        try:
            conn.execute("SELECT session_minutes FROM users LIMIT 1")
        except sqlite3.OperationalError:
            conn.execute("ALTER TABLE users ADD COLUMN session_minutes INTEGER NOT NULL DEFAULT 1440")
            conn.commit()
        return conn

    def create_user(username: str, password: str) -> dict:
        conn = get_db()
        try:
            count = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
            role = "admin" if count == 0 else "user"
            approved = 1 if count == 0 else 0
            password_hash = _bcrypt.hashpw(password.encode(), _bcrypt.gensalt()).decode()
            conn.execute(
                "INSERT INTO users (username, password_hash, role, approved) VALUES (?, ?, ?, ?)",
                (username, password_hash, role, approved),
            )
            conn.commit()
            user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
            vol.commit()  # persist DB changes (sync OK in non-async helper)
            return dict(user)
        except sqlite3.IntegrityError:
            raise HTTPException(status_code=409, detail="Username already exists")
        finally:
            conn.close()

    def authenticate_user(username: str, password: str):
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
        conn.close()
        if not user or not _bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
            return None
        return dict(user)

    def get_user_by_id(user_id: int):
        conn = get_db()
        user = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        conn.close()
        return dict(user) if user else None

    def list_users_db(search: str = "") -> list[dict]:
        conn = get_db()
        if search:
            users = conn.execute(
                "SELECT id, username, role, approved, session_minutes, created_at FROM users WHERE username LIKE ?",
                (f"%{search}%",),
            ).fetchall()
        else:
            users = conn.execute(
                "SELECT id, username, role, approved, session_minutes, created_at FROM users"
            ).fetchall()
        conn.close()
        return [dict(u) for u in users]

    def set_user_approved(user_id: int, approved: bool):
        conn = get_db()
        conn.execute("UPDATE users SET approved = ? WHERE id = ?", (1 if approved else 0, user_id))
        conn.commit()
        user = conn.execute(
            "SELECT id, username, role, approved, session_minutes, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        conn.close()
        vol.commit()
        return dict(user) if user else None

    def set_session_minutes(user_id: int, minutes: int):
        if minutes < 0 or minutes > 10080:
            raise HTTPException(status_code=400, detail="Session must be 0 (infinite) to 10080 minutes")
        conn = get_db()
        conn.execute("UPDATE users SET session_minutes = ? WHERE id = ?", (minutes, user_id))
        conn.commit()
        user = conn.execute(
            "SELECT id, username, role, approved, session_minutes, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        conn.close()
        vol.commit()
        return dict(user) if user else None

    def set_user_role(user_id: int, role: str):
        if role not in ("admin", "user"):
            raise HTTPException(status_code=400, detail="Role must be 'admin' or 'user'")
        conn = get_db()
        if role == "user":
            current = conn.execute("SELECT role FROM users WHERE id = ?", (user_id,)).fetchone()
            if current and current["role"] == "admin":
                admin_count = conn.execute("SELECT COUNT(*) FROM users WHERE role = 'admin'").fetchone()[0]
                if admin_count <= 1:
                    conn.close()
                    raise HTTPException(status_code=400, detail="Cannot demote the last admin")
        conn.execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
        conn.commit()
        user = conn.execute(
            "SELECT id, username, role, approved, session_minutes, created_at FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        conn.close()
        vol.commit()
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
        vol.commit()
        return result.rowcount > 0

    def create_token(user: dict) -> str:
        minutes = user.get("session_minutes", DEFAULT_SESSION_MINUTES)
        if minutes == 0:
            minutes = 60 * 24 * 30
        expire = datetime.now(timezone.utc) + timedelta(minutes=minutes)
        payload = {
            "sub": str(user["id"]),
            "username": user["username"],
            "role": user["role"],
            "approved": bool(user["approved"]),
            "exp": expire,
        }
        return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

    def create_guest_token() -> str:
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
        try:
            return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid or expired token")

    async def get_current_user(
        credentials: HTTPAuthorizationCredentials | None = Depends(security),
    ) -> dict:
        if not credentials:
            raise HTTPException(status_code=401, detail="Not authenticated")
        payload = decode_token(credentials.credentials)
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
        if user["role"] != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")
        return user

    # ---- FastAPI app ----
    fastapi_app = FastAPI(title="BIS YOLO Backend")

    fastapi_app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],  # Vercel + local dev
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    models_path = Path(MODELS_DIR)
    models_path.mkdir(parents=True, exist_ok=True)
    vol.commit()

    # Track temp models + active connections
    temp_models: dict[str, int] = {}
    active_connections: dict[int, int] = {}

    class LoginRequest(BaseModel):
        username: str
        password: str

    class RenameRequest(BaseModel):
        name: str

    class SessionMinutesRequest(BaseModel):
        minutes: int

    class RoleRequest(BaseModel):
        role: str

    # ---- Auth endpoints ----

    @fastapi_app.post("/api/auth/register")
    async def register(req: LoginRequest):
        if len(req.username) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
        if len(req.password) < 4:
            raise HTTPException(status_code=400, detail="Password must be at least 4 characters")
        user = create_user(req.username, req.password)
        token = create_token(user)
        return {
            "token": token,
            "user": {
                "id": user["id"], "username": user["username"],
                "role": user["role"], "approved": bool(user["approved"]),
                "session_minutes": user.get("session_minutes", 1440),
            },
        }

    @fastapi_app.post("/api/auth/login")
    async def login(req: LoginRequest):
        user = authenticate_user(req.username, req.password)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid credentials")
        if not user["approved"]:
            raise HTTPException(status_code=403, detail="Account pending admin approval")
        token = create_token(user)
        return {
            "token": token,
            "user": {
                "id": user["id"], "username": user["username"],
                "role": user["role"], "approved": bool(user["approved"]),
                "session_minutes": user.get("session_minutes", 1440),
            },
        }

    @fastapi_app.post("/api/auth/guest")
    async def guest_login():
        token = create_guest_token()
        return {
            "token": token,
            "user": {
                "id": 0, "username": "guest", "role": "guest",
                "approved": True, "session_minutes": GUEST_SESSION_MINUTES,
            },
        }

    @fastapi_app.get("/api/auth/me")
    async def get_me(user: dict = Depends(get_current_user)):
        return {
            "id": user["id"], "username": user["username"],
            "role": user["role"], "approved": bool(user["approved"]),
            "session_minutes": user.get("session_minutes", 1440),
        }

    # ---- Admin endpoints ----

    @fastapi_app.get("/api/admin/users")
    async def admin_list_users(search: str = "", admin: dict = Depends(require_admin)):
        return list_users_db(search)

    @fastapi_app.patch("/api/admin/users/{user_id}/approve")
    async def admin_approve_user(user_id: int, approved: bool = True, admin: dict = Depends(require_admin)):
        user = set_user_approved(user_id, approved)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")
        return user

    @fastapi_app.delete("/api/admin/users/{user_id}")
    async def admin_delete_user(user_id: int, admin: dict = Depends(require_admin)):
        if user_id == admin["id"]:
            raise HTTPException(status_code=400, detail="Cannot delete your own account")
        if not delete_user(user_id):
            raise HTTPException(status_code=404, detail="User not found")
        return {"message": "User deleted"}

    @fastapi_app.patch("/api/admin/users/{user_id}/session")
    async def admin_set_session(user_id: int, req: SessionMinutesRequest, admin: dict = Depends(require_admin)):
        updated = set_session_minutes(user_id, req.minutes)
        if not updated:
            raise HTTPException(status_code=404, detail="User not found")
        return updated

    @fastapi_app.patch("/api/admin/users/{user_id}/role")
    async def admin_set_role(user_id: int, req: RoleRequest, admin: dict = Depends(require_admin)):
        updated = set_user_role(user_id, req.role)
        if not updated:
            raise HTTPException(status_code=404, detail="User not found")
        return updated

    # ---- Model endpoints ----

    async def get_available_models():
        await vol.reload.aio()  # see latest uploads
        models = []
        for file in models_path.glob("*.pt"):
            size_bytes = file.stat().st_size
            size_mb = size_bytes / (1024 * 1024)
            models.append({
                "id": file.stem,
                "name": file.stem.upper(),
                "endpoint": f"/models/{file.name}",
                "size": f"{size_mb:.1f} MB",
                "path": str(file),
            })
        return models

    @fastapi_app.get("/api/models")
    async def list_models_endpoint(user: dict = Depends(get_current_user)):
        return await get_available_models()

    @fastapi_app.post("/api/models/upload")
    async def upload_model(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
        if not file.filename.endswith(".pt"):
            raise HTTPException(status_code=400, detail="Only .pt files are supported.")
        file_path = models_path / file.filename
        try:
            content = await file.read()
            with open(file_path, "wb") as f:
                f.write(content)
            await vol.commit.aio()  # persist to Volume

            # Track non-admin uploads as temporary
            if user.get("role") != "admin":
                model_id = file.filename.rsplit(".", 1)[0]
                temp_models[model_id] = user.get("id", 0)

            return JSONResponse({"message": "Model uploaded successfully", "filename": file.filename})
        except Exception as e:
            raise HTTPException(status_code=500, detail=str(e))

    @fastapi_app.patch("/api/models/{model_id}/rename")
    async def rename_model(model_id: str, req: RenameRequest, user: dict = Depends(require_admin)):
        old_path = models_path / f"{model_id}.pt"
        if not old_path.exists():
            raise HTTPException(status_code=404, detail="Model not found")
        new_name = req.name.strip()
        if not new_name:
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        safe_name = "".join(c for c in new_name if c.isalnum() or c in "-_.")
        if not safe_name:
            raise HTTPException(status_code=400, detail="Invalid name")
        new_path = models_path / f"{safe_name}.pt"
        if new_path.exists() and new_path != old_path:
            raise HTTPException(status_code=409, detail="A model with that name already exists")
        old_path.rename(new_path)
        await vol.commit.aio()
        return {"message": "Model renamed", "old_id": model_id, "new_id": safe_name}

    @fastapi_app.delete("/api/models/{model_id}")
    async def delete_model(model_id: str, user: dict = Depends(require_admin)):
        model_path = models_path / f"{model_id}.pt"
        if not model_path.exists():
            raise HTTPException(status_code=404, detail="Model not found")
        model_path.unlink()
        await vol.commit.aio()
        return {"message": "Model deleted", "id": model_id}

    # ---- Health check ----

    @fastapi_app.get("/api/health")
    async def health():
        return {"status": "ok"}

    # ---- WebSocket for real-time detection ----

    @fastapi_app.websocket("/ws/detect")
    async def websocket_detect(websocket: WebSocket, token: str = Query(None)):
        if not token:
            await websocket.close(code=4001, reason="Token required")
            return

        try:
            payload = decode_token(token)
            if payload.get("sub") == "guest":
                user = {"id": 0, "username": "guest", "role": "guest", "approved": 1}
            else:
                user_id = int(payload["sub"])
                user = get_user_by_id(user_id)
                if not user:
                    await websocket.close(code=4003, reason="Access denied")
                    return
                if not user["approved"]:
                    await websocket.close(code=4003, reason="Access denied")
                    return
        except Exception:
            await websocket.close(code=4001, reason="Invalid token")
            return

        await websocket.accept()
        uid = user.get("id", 0)
        active_connections[uid] = active_connections.get(uid, 0) + 1
        print(f"Client connected: {user['username']} (connections: {active_connections[uid]})")

        try:
            while True:
                data = await websocket.receive_json()
                action = data.get("action")

                if action == "load_model":
                    model_id = data.get("model")
                    models = await get_available_models()
                    model_info = next((m for m in models if m["id"] == model_id), None)
                    if not model_info:
                        await websocket.send_json({"error": "Model not found"})
                        continue
                    await websocket.send_json({"status": "model_loaded", "model": model_id})

                elif action in ("detect", "capture"):
                    model_id = data.get("model")
                    frame_b64 = data.get("frame")
                    conf = float(data.get("conf", 0.25))

                    if not frame_b64:
                        continue

                    # Decode base64 to raw JPEG bytes (no re-encoding needed)
                    if "base64," in frame_b64:
                        frame_b64 = frame_b64.split("base64,")[1]
                    frame_bytes = base64.b64decode(frame_b64)

                    try:
                        # Dispatch to GPU function
                        result = await run_inference.remote.aio(model_id, frame_bytes, conf, action)
                        await websocket.send_json(result)
                    except Exception as e:
                        print(f"Inference error: {e}")
                        await websocket.send_json({"error": "Inference failed"})

        except WebSocketDisconnect:
            print(f"Client disconnected: {user['username']}")
        except Exception as e:
            print(f"WS Exception: {e}")
            try:
                await websocket.close()
            except Exception:
                pass
        finally:
            uid = user.get("id", 0)
            active_connections[uid] = max(0, active_connections.get(uid, 1) - 1)

            # Clean up temp models when last connection closes
            if active_connections[uid] == 0 and user.get("role") != "admin":
                to_remove = [mid for mid, owner in temp_models.items() if owner == uid]
                for mid in to_remove:
                    mp = models_path / f"{mid}.pt"
                    if mp.exists():
                        mp.unlink()
                        print(f"Cleaned up temp model: {mid} (user: {user['username']})")
                    del temp_models[mid]
                if to_remove:
                    await vol.commit.aio()

    return fastapi_app
