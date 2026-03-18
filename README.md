# BIS — Blister Inspection System

Real-time blister pack quality inspection powered by YOLO segmentation models. Detects **Full** (pill present), **Empty** (missing pill), and **Blister** (pack structure) classes with live segmentation overlays.

![Python](https://img.shields.io/badge/Python-3.10+-blue)
![React](https://img.shields.io/badge/React-18+-61DAFB)
![YOLO](https://img.shields.io/badge/YOLO-v8%2Fv11%2Fv26-green)

---

## Features

- 🔍 **Real-time detection** — Live camera feed with bounding boxes and segmentation masks
- 📸 **Capture mode** — Freeze a frame for detailed single-shot analysis
- 🔄 **Model comparison** — Compare N models side-by-side on the same frame
- 📤 **Model upload** — Import custom `.pt` models directly from the UI
- 🌗 **Dark / Light theme** — Toggle between themes
- 📱 **Mobile responsive** — Works on phones and tablets

---

## Prerequisites

- **Python 3.10+** with `pip`
- **Node.js 18+** with `npm`
- A webcam (or virtual camera)

---

## Quick Start

### 1. Clone the repo

```bash
git clone https://github.com/YOUR_USERNAME/BIS.git
cd BIS
```

### 2. Backend setup

```bash
cd backend

# Create a virtual environment
python3 -m venv venv

# Activate it
# Linux / macOS (bash/zsh):
source venv/bin/activate
# Linux / macOS (fish):
. venv/bin/activate.fish
# Windows:
venv\Scripts\activate

# Install dependencies
pip install fastapi uvicorn ultralytics opencv-python-headless python-multipart

# Place your YOLO model(s) in the models/ directory
# e.g. cp /path/to/best.pt models/

# Start the backend server
uvicorn server:app --host 0.0.0.0 --port 8000
```

The API will be available at `http://localhost:8000`.

### 3. Frontend setup

Open a **new terminal**:

```bash
cd Webapp

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app will be available at `http://localhost:5173`.

### 4. Production build (optional)

```bash
cd Webapp
npm run build
# Output in dist/
```

---

## Project Structure

```
BIS/
├── backend/
│   ├── server.py          # FastAPI + YOLO inference server
│   ├── models/            # Place .pt model files here
│   └── venv/              # Python virtual environment
├── Webapp/
│   ├── src/
│   │   ├── app/
│   │   │   ├── App.tsx              # Main application
│   │   │   ├── components/          # UI components
│   │   │   ├── hooks/               # React hooks (camera, inference)
│   │   │   └── services/            # Inference service layer
│   │   └── styles/                  # CSS with theme variables
│   ├── package.json
│   └── vite.config.ts
└── README.md
```

---

## Model Specifications

| Parameter       | Value                          |
|-----------------|--------------------------------|
| Task            | Instance Segmentation          |
| Input Size      | 768 × 768 px                   |
| Classes         | `Blister`, `Empty`, `Full`     |
| Default Conf    | 0.25                           |
| Format          | `.pt` (PyTorch)                |

---

## Hosting Options

| Platform | Type | Cost | Notes |
|----------|------|------|-------|
| **[Render](https://render.com)** | PaaS | Free tier (512 MB RAM) | Good for backend; free web services spin down after inactivity |
| **[Railway](https://railway.app)** | PaaS | $5/mo credit free | Easy deploy from GitHub, supports Python + Node |
| **[Vercel](https://vercel.com)** | Static/Serverless | Free | Great for the React frontend; backend needs a separate host |
| **[Fly.io](https://fly.io)** | Containers | Free tier (3 shared VMs) | Supports Docker, good for the Python backend |
| **[Hugging Face Spaces](https://huggingface.co/spaces)** | ML Apps | Free (CPU) | Best for showcasing YOLO models; supports Gradio/FastAPI |
| **[Google Cloud Run](https://cloud.google.com/run)** | Serverless containers | Free tier (2M requests/mo) | Scales to zero, pay-per-use |
| **[AWS Lambda + S3](https://aws.amazon.com)** | Serverless | Free tier (1M requests/mo) | Frontend on S3, backend on Lambda |

### Recommended setup for this project:
- **Frontend**: Deploy `Webapp/dist/` to **Vercel** (free, instant)
- **Backend**: Deploy `backend/` to **Render** or **Hugging Face Spaces** (free, GPU available on HF)

> **Note**: YOLO inference requires at least **1 GB RAM** and benefits greatly from a GPU. Free CPU tiers will be slow (~500ms+ per frame). For real-time inference, a GPU instance ($5–20/mo) is recommended.

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| Backend port | `8000` | Set via `uvicorn --port` |
| Frontend API URL | `http://localhost:8000` | Hardcoded in services; update for production |
| WebSocket URL | `ws://localhost:8000/ws/detect` | Hardcoded in services |

---

## License

MIT
