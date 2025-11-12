from ultralytics import YOLO
model = YOLO("yolo8n/yolo8n-seg/runs/segment/train/weights/best.pt")
model.predict(source="2", imgsz=768, show=True)  # try "1"/"2" if multiple cameras
