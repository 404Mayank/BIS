#!/usr/bin/env bash
set -euo pipefail

# BIS Modal Deployment Script
# Usage: ./deploy.sh

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== BIS Modal Backend Deployment ==="
echo ""

# 1. Create the Volume (idempotent — skips if exists)
echo "📦 Ensuring Modal Volume 'bis-storage' exists..."
modal volume create bis-storage 2>/dev/null || echo "   Volume already exists."

# 2. Ensure models directory exists on Volume
echo "📁 Ensuring /data/models/ directory on Volume..."
modal shell --cmd "mkdir -p /data/models" --volume bis-storage:/data 2>/dev/null || true

# 3. Deploy the Modal app
echo ""
echo "🚀 Deploying Modal app..."
modal deploy modal_app.py

echo ""
echo "✅ Deployment complete!"
echo ""
echo "Next steps:"
echo "  1. Upload models via the admin UI (login → upload .pt files)"
echo "  2. Set these environment variables in Vercel:"
echo "     VITE_API_URL = https://<your-modal-url>"
echo "     VITE_WS_URL  = wss://<your-modal-url>"
echo "  3. Redeploy your Vercel frontend"
