# BIS (Blister Identification System)

A real-time pill blister pack defect detection UI built with Vite, React, and TailwindCSS. It connects to a webcam or accepts image uploads, runs YOLO inference via a WebSocket backend, and draws bounding boxes on detected defects.

## Features Added
- **Image/Video Upload Mode:** Drag and drop or upload static images for YOLO inspection alongside the live webcam feed.
- **Async Inference Service:** Non-blocking async WebSocket inference for improved responsiveness and synchronized bounding box rendering.
- **Pass/Fail Summary:** Real-time Pass/Fail status banner based on critical detections (missing pills).
- **Dark/Light Theme:** Built-in UI toggle for switching between dark and light themes smoothly.

## Setup & Running

1. **Install Dependencies:**
   ```bash
   # Use ignore-scripts to bypass the esbuild post-install step on node 25+
   npm config set ignore-scripts true
   npm install
   ```

2. **Start the Development Server:**
   ```bash
   npm run dev
   ```
   *The app will be available at `http://localhost:5173`.*

3. **Backend Service:**
   Ensure your Ultralytics FastAPI WebSocket server is running on `ws://localhost:8000/ws/detect` to process live inference frames.