import os
import io
import cv2
import base64
import numpy as np
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException, Depends, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO
from pydantic import BaseModel
from auth import (
    create_user, authenticate_user, create_token, create_guest_token, decode_token,
    get_current_user, require_admin, get_user_by_id,
    list_users, set_user_approved, set_session_minutes, delete_user
)

app = FastAPI(title="BIS YOLO Backend")

# Allow CORS for the frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173", "http://localhost:8000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

MODELS_DIR = (Path(__file__).parent / "models").resolve()
MODELS_DIR.mkdir(parents=True, exist_ok=True)

# Target input size (model was trained on 768x768)
TARGET_SIZE = 768

# Global dictionary to cache loaded models
loaded_models: dict[str, YOLO] = {}


# --- Pydantic models ---

class LoginRequest(BaseModel):
    username: str
    password: str

class RenameRequest(BaseModel):
    name: str

class SessionRequest(BaseModel):
    minutes: int


# --- Auth endpoints ---

@app.post("/api/auth/register")
async def register(req: LoginRequest):
    """Register a new user. First user becomes admin (auto-approved)."""
    if len(req.username) < 3:
        raise HTTPException(status_code=400, detail="Username must be at least 3 characters")
    if len(req.password) < 4:
        raise HTTPException(status_code=400, detail="Password must be at least 4 characters")

    user = create_user(req.username, req.password)
    token = create_token(user)
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "approved": bool(user["approved"]),
            "session_minutes": user.get("session_minutes", 5),
        }
    }


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    """Login with username and password."""
    user = authenticate_user(req.username, req.password)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user["approved"]:
        raise HTTPException(status_code=403, detail="Account pending admin approval")

    token = create_token(user)
    return {
        "token": token,
        "user": {
            "id": user["id"],
            "username": user["username"],
            "role": user["role"],
            "approved": bool(user["approved"]),
            "session_minutes": user.get("session_minutes", 5),
        }
    }


@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user)):
    """Get current user info."""
    return {
        "id": user["id"],
        "username": user["username"],
        "role": user["role"],
        "approved": bool(user["approved"]),
        "session_minutes": user.get("session_minutes", 5),
    }


@app.post("/api/auth/guest")
async def guest_login():
    """Create a 5-minute guest session for preview."""
    token = create_guest_token()
    return {
        "token": token,
        "user": {
            "id": 0,
            "username": "guest",
            "role": "guest",
            "approved": True,
            "session_minutes": 5,
        }
    }


# --- Admin endpoints ---

@app.get("/api/admin/users")
async def admin_list_users(search: str = "", admin: dict = Depends(require_admin)):
    """List all users with optional search."""
    return list_users(search)


@app.patch("/api/admin/users/{user_id}/approve")
async def admin_approve_user(user_id: int, approved: bool = True, admin: dict = Depends(require_admin)):
    """Approve or disapprove a user."""
    user = set_user_approved(user_id, approved)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@app.delete("/api/admin/users/{user_id}")
async def admin_delete_user(user_id: int, admin: dict = Depends(require_admin)):
    """Delete a user account."""
    if user_id == admin["id"]:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    if not delete_user(user_id):
        raise HTTPException(status_code=404, detail="User not found")
    return {"message": "User deleted"}


@app.patch("/api/admin/users/{user_id}/session")
async def admin_set_session(user_id: int, req: SessionRequest, admin: dict = Depends(require_admin)):
    """Set session length in minutes for a user."""
    if req.minutes < 1 or req.minutes > 10080:  # max 1 week
        raise HTTPException(status_code=400, detail="Session must be 1-10080 minutes")
    user = set_session_minutes(user_id, req.minutes)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


# --- Model endpoints ---

def get_available_models():
    """Scan the models directory for .pt files."""
    models = []
    for file in MODELS_DIR.glob("*.pt"):
        size_bytes = file.stat().st_size
        size_mb = size_bytes / (1024 * 1024)
        models.append({
            "id": file.stem,
            "name": file.stem.upper(),
            "endpoint": f"/models/{file.name}",
            "size": f"{size_mb:.1f} MB",
            "path": str(file)
        })
    return models


@app.get("/api/models")
async def list_models_endpoint(user: dict = Depends(get_current_user)):
    """Return all available YOLO models. Requires auth."""
    return get_available_models()


@app.post("/api/models/upload")
async def upload_model(file: UploadFile = File(...), user: dict = Depends(require_admin)):
    """Upload a new .pt YOLO model. Admin only."""
    if not file.filename.endswith('.pt'):
        raise HTTPException(status_code=400, detail="Only .pt files are supported.")

    file_path = MODELS_DIR / file.filename
    try:
        content = await file.read()
        with open(file_path, "wb") as f:
            f.write(content)
        return JSONResponse({"message": "Model uploaded successfully", "filename": file.filename})
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.patch("/api/models/{model_id}/rename")
async def rename_model(model_id: str, req: RenameRequest, user: dict = Depends(require_admin)):
    """Rename a model file. Admin only."""
    old_path = MODELS_DIR / f"{model_id}.pt"
    if not old_path.exists():
        raise HTTPException(status_code=404, detail="Model not found")

    new_name = req.name.strip()
    if not new_name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")

    # Sanitize filename
    safe_name = "".join(c for c in new_name if c.isalnum() or c in "-_.")
    if not safe_name:
        raise HTTPException(status_code=400, detail="Invalid name")

    new_path = MODELS_DIR / f"{safe_name}.pt"
    if new_path.exists() and new_path != old_path:
        raise HTTPException(status_code=409, detail="A model with that name already exists")

    # Update loaded_models cache
    if model_id in loaded_models:
        loaded_models[safe_name] = loaded_models.pop(model_id)

    old_path.rename(new_path)
    return {"message": "Model renamed", "old_id": model_id, "new_id": safe_name}


@app.delete("/api/models/{model_id}")
async def delete_model(model_id: str, user: dict = Depends(require_admin)):
    """Delete a model file. Admin only."""
    model_path = MODELS_DIR / f"{model_id}.pt"
    if not model_path.exists():
        raise HTTPException(status_code=404, detail="Model not found")

    # Remove from cache
    loaded_models.pop(model_id, None)
    model_path.unlink()
    return {"message": "Model deleted", "id": model_id}


# --- Image processing ---

def letterbox(img: np.ndarray, new_shape: int = 768) -> tuple[np.ndarray, float, tuple[int, int]]:
    """Resize and pad image to square while maintaining aspect ratio."""
    h, w = img.shape[:2]
    scale = new_shape / max(h, w)
    new_w, new_h = int(w * scale), int(h * scale)

    resized = cv2.resize(img, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    pad_w = (new_shape - new_w) // 2
    pad_h = (new_shape - new_h) // 2

    padded = cv2.copyMakeBorder(
        resized, pad_h, new_shape - new_h - pad_h,
        pad_w, new_shape - new_w - pad_w,
        cv2.BORDER_CONSTANT, value=(114, 114, 114)
    )
    return padded, scale, (pad_w, pad_h)


def decode_image_base64(data: str) -> np.ndarray:
    """Decode base64 image data to OpenCV format."""
    if "base64," in data:
        data = data.split("base64,")[1]

    img_bytes = base64.b64decode(data)
    nparr = np.frombuffer(img_bytes, np.uint8)
    img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
    return img


def format_detections(results, scale: float = 1.0, pad: tuple[int, int] = (0, 0)) -> list:
    """Convert YOLO results to frontend format with segmentation masks."""
    detections = []

    if len(results) == 0:
        return detections

    result = results[0]
    boxes = result.boxes
    names = result.names
    masks = result.masks

    orig_shape = result.orig_shape
    img_h, img_w = orig_shape

    if boxes is not None:
        for i, box in enumerate(boxes):
            xywhn = box.xywhn[0].cpu().numpy().tolist()
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            class_name = names[cls_id]

            det = {
                "class": class_name,
                "confidence": conf,
                "bbox": xywhn
            }

            if masks is not None and i < len(masks.xyn):
                polygon = masks.xyn[i].tolist()
                if len(polygon) > 50:
                    step = max(1, len(polygon) // 50)
                    polygon = polygon[::step]
                det["segments"] = polygon

            detections.append(det)

    return detections


# --- WebSocket (auth via query param) ---

@app.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket, token: str = Query(None)):
    """WebSocket endpoint for real-time YOLO inference. Requires auth token."""
    # Validate token before accepting
    if not token:
        await websocket.close(code=4001, reason="Token required")
        return

    try:
        payload = decode_token(token)
        # Guest users don't have DB records
        if payload.get("sub") == "guest":
            user = {"id": 0, "username": "guest", "role": "guest", "approved": 1}
        else:
            user_id = int(payload["sub"])
            user = get_user_by_id(user_id)
            if not user or not user["approved"]:
                await websocket.close(code=4003, reason="Access denied")
                return
    except Exception:
        await websocket.close(code=4001, reason="Invalid token")
        return

    await websocket.accept()
    print(f"Client connected: {user['username']}")

    try:
        while True:
            data = await websocket.receive_json()
            action = data.get('action')

            if action == 'load_model':
                model_id = data.get('model')
                model_info = next((m for m in get_available_models() if m['id'] == model_id), None)
                if not model_info:
                    await websocket.send_json({"error": "Model not found"})
                    continue

                if model_id not in loaded_models:
                    print(f"Loading model {model_id} from {model_info['path']}...")
                    loaded_models[model_id] = YOLO(model_info['path'])

                await websocket.send_json({"status": "model_loaded", "model": model_id})

            elif action == 'detect':
                model_id = data.get('model')
                if model_id not in loaded_models:
                    await websocket.send_json({"error": f"Model {model_id} not loaded"})
                    continue

                frame_b64 = data.get('frame')
                conf = float(data.get('conf', 0.25))

                if not frame_b64:
                    continue

                try:
                    img = decode_image_base64(frame_b64)
                    img_padded, scale, pad = letterbox(img, TARGET_SIZE)

                    model = loaded_models[model_id]
                    results = model(img_padded, conf=conf, verbose=False)

                    speed = results[0].speed
                    inf_time = speed['inference']

                    detections = format_detections(results, scale, pad)

                    await websocket.send_json({
                        "detections": detections,
                        "inference_time": inf_time
                    })
                except Exception as e:
                    print(f"Error during inference: {e}")
                    await websocket.send_json({"error": "Inference failed"})

            elif action == 'capture':
                model_id = data.get('model')
                if model_id not in loaded_models:
                    await websocket.send_json({"error": f"Model {model_id} not loaded"})
                    continue

                frame_b64 = data.get('frame')
                conf = float(data.get('conf', 0.25))

                if not frame_b64:
                    continue

                try:
                    img = decode_image_base64(frame_b64)
                    img_padded, scale, pad = letterbox(img, TARGET_SIZE)

                    model = loaded_models[model_id]
                    results = model(img_padded, conf=conf, verbose=False)

                    speed = results[0].speed
                    inf_time = speed['inference']
                    detections = format_detections(results, scale, pad)

                    class_counts = {}
                    for d in detections:
                        cls = d['class']
                        class_counts[cls] = class_counts.get(cls, 0) + 1

                    await websocket.send_json({
                        "action": "capture_result",
                        "detections": detections,
                        "inference_time": inf_time,
                        "summary": class_counts,
                        "total": len(detections)
                    })
                except Exception as e:
                    print(f"Error during capture: {e}")
                    await websocket.send_json({"error": "Capture failed"})

    except WebSocketDisconnect:
        print(f"Client disconnected: {user['username']}")
    except Exception as e:
        print(f"WS Exception: {e}")
        try:
            await websocket.close()
        except:
            pass
