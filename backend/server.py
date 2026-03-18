import os
import io
import cv2
import base64
import numpy as np
from pathlib import Path
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from ultralytics import YOLO

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
async def list_models():
    """Return all available YOLO models."""
    return get_available_models()

@app.post("/api/models/upload")
async def upload_model(file: UploadFile = File(...)):
    """Upload a new .pt YOLO model."""
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

def letterbox(img: np.ndarray, new_shape: int = 768) -> tuple[np.ndarray, float, tuple[int, int]]:
    """Resize and pad image to square while maintaining aspect ratio.
    Returns: (padded_image, scale_ratio, (pad_w, pad_h))
    """
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
    masks = result.masks  # Segmentation masks
    
    orig_shape = result.orig_shape  # (h, w)
    img_h, img_w = orig_shape
    
    if boxes is not None:
        for i, box in enumerate(boxes):
            # normalized xywh (center format)
            xywhn = box.xywhn[0].cpu().numpy().tolist()
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            class_name = names[cls_id]
            
            det = {
                "class": class_name,
                "confidence": conf,
                "bbox": xywhn
            }
            
            # Extract segmentation polygon if available
            if masks is not None and i < len(masks.xyn):
                # masks.xyn gives normalized polygon points [[x1,y1], [x2,y2], ...]
                polygon = masks.xyn[i].tolist()
                # Downsample polygon points for performance (max ~50 points)
                if len(polygon) > 50:
                    step = max(1, len(polygon) // 50)
                    polygon = polygon[::step]
                det["segments"] = polygon
            
            detections.append(det)
            
    return detections

@app.websocket("/ws/detect")
async def websocket_detect(websocket: WebSocket):
    await websocket.accept()
    print("Client connected to WS")
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
                    
                    # Letterbox to TARGET_SIZE for best accuracy
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
                """Single-shot capture: run inference and return detailed results."""
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
                    
                    # Count classes for summary
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
        print("Client disconnected")
    except Exception as e:
        print(f"WS Exception: {e}")
        try:
            await websocket.close()
        except:
            pass
