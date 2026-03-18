import { RefObject, useState, useEffect, useRef } from 'react';
import { Camera, Crosshair, Loader2 } from 'lucide-react';
import type { CaptureResult } from '../services/inference-service';
import { getDetectionColor, getDetectionFillColor } from '../services/inference-service';

interface DetectionOutputProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  videoRef: RefObject<HTMLVideoElement | null>;
  isRunning: boolean;
  isCameraOn: boolean;
  isWaitingForGpu?: boolean;
  onCapture?: () => Promise<CaptureResult | null>;
}

export function DetectionOutput({ canvasRef, videoRef, isRunning, isCameraOn, isWaitingForGpu, onCapture }: DetectionOutputProps) {
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [frozenFrame, setFrozenFrame] = useState<string | null>(null);

  // Clear capture overlay when camera goes off/on
  useEffect(() => {
    if (!isCameraOn) {
      setCaptureResult(null);
      setFrozenFrame(null);
      setIsCapturing(false);
    }
  }, [isCameraOn]);

  const handleCapture = async () => {
    if (!onCapture || !videoRef.current) return;

    // Freeze the current frame immediately so user sees a snapshot while GPU works
    try {
      const video = videoRef.current;
      const tempCanvas = document.createElement('canvas');
      tempCanvas.width = video.videoWidth;
      tempCanvas.height = video.videoHeight;
      const ctx = tempCanvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        setFrozenFrame(tempCanvas.toDataURL('image/jpeg', 0.9));
      }
    } catch { /* ignore freeze errors */ }

    setIsCapturing(true);
    setCaptureResult(null);
    try {
      const result = await onCapture();
      if (result) {
        setCaptureResult(result);
        setFrozenFrame(null); // replace frozen frame with annotated result
      } else {
        setFrozenFrame(null); // unfreeze on failure
      }
    } catch {
      setFrozenFrame(null);
    } finally {
      setIsCapturing(false);
    }
  };

  const dismissCapture = () => {
    setCaptureResult(null);
    setFrozenFrame(null);
  };

  return (
    <div className="border border-neutral-700/50 dark:border-neutral-700/50 bg-[var(--bg-card)] overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50 bg-[var(--bg-card-header)] shrink-0">
        <span className="text-[var(--accent-muted)] text-[10px] tracking-widest uppercase">
          Live Feed
        </span>
        <div className="flex items-center gap-2">
          {onCapture && (
            <button
              onClick={handleCapture}
              disabled={isCapturing || !isCameraOn}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-cyan-900/40 hover:bg-cyan-800/50 border border-cyan-700/40 text-cyan-300 tracking-wider uppercase transition-colors disabled:opacity-50"
            >
              {isCapturing ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Crosshair className="w-3 h-3" />
              )}
              Capture
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${!isCameraOn ? 'bg-[var(--text-muted)]' : isRunning ? 'bg-red-500 animate-pulse' : 'bg-emerald-400'}`} />
            <span className={`text-[10px] tracking-wider uppercase ${!isCameraOn ? 'text-[var(--text-muted)]' : isRunning ? 'text-red-400' : 'text-emerald-400'}`}>
              {!isCameraOn ? 'OFFLINE' : isRunning ? 'DETECTING' : 'LIVE'}
            </span>
          </div>
        </div>
      </div>

      <div className="relative bg-neutral-950 flex-1 min-h-0">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 w-full h-full object-contain"
          style={{ opacity: captureResult || frozenFrame ? 0 : 1 }}
        />
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full object-contain"
          style={{ pointerEvents: 'none', opacity: captureResult || frozenFrame ? 0 : 1 }}
        />

        {/* Frozen frame shown while GPU processes capture */}
        {frozenFrame && !captureResult && (
          <div className="absolute inset-0 z-5 bg-black flex items-center justify-center">
            <img src={frozenFrame} alt="Captured frame" className="w-full h-full object-contain" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
              <div className="flex items-center gap-2 text-cyan-400 text-xs tracking-wider">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Processing on GPU…</span>
              </div>
            </div>
          </div>
        )}

        {/* GPU initialization overlay — first frame delay */}
        {isWaitingForGpu && !captureResult && !frozenFrame && (
          <div className="absolute inset-0 z-5 flex items-center justify-center bg-black/50 pointer-events-none">
            <div className="flex items-center gap-2 px-4 py-2 bg-neutral-900/90 border border-neutral-700/50">
              <Loader2 className="w-4 h-4 text-cyan-400 animate-spin" />
              <span className="text-cyan-300 text-xs tracking-wider">Initializing GPU…</span>
            </div>
          </div>
        )}

        {/* Capture Result Overlay */}
        {captureResult && (
          <div className="absolute inset-0 z-10 bg-black flex flex-col">
            <div className="flex-1 relative bg-neutral-950 overflow-hidden">
              <CapturedCanvas result={captureResult} />
            </div>
            <div className="bg-neutral-900 border-t border-neutral-700/60 p-3 sm:p-4 shrink-0">
              <div className="flex items-center justify-between mb-3">
                <span className="text-cyan-400 text-xs tracking-widest uppercase">Capture Analysis</span>
                <button onClick={dismissCapture} className="text-neutral-500 hover:text-neutral-300 text-xs">✕ Close</button>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
                {Object.entries(captureResult.summary).map(([cls, count]) => (
                  <div key={cls} className="flex items-center gap-2 px-2 py-1.5 bg-neutral-800/60 border border-neutral-700/40">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: getDetectionColor(cls) }} />
                    <span className="text-neutral-200 text-xs">{cls}</span>
                    <span className="ml-auto text-xs font-medium" style={{ color: getDetectionColor(cls) }}>{count}</span>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-4 text-[10px] text-neutral-500">
                <span>{captureResult.total} detections</span>
                <span>{captureResult.inferenceTimeMs.toFixed(0)}ms inference</span>
              </div>
            </div>
          </div>
        )}

        {!isCameraOn && (
          <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/95 z-0">
            <div className="text-center space-y-2">
              <Camera className="w-8 h-8 mx-auto text-neutral-700" />
              <p className="text-neutral-500 text-xs">Camera offline</p>
              <p className="text-neutral-600 text-[10px]">Enable camera to start</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export function CapturedCanvas({ result }: { result: CaptureResult }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!result.frameData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new window.Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      // Draw Masks
      result.detections.forEach(det => {
        if (det.segments && det.segments.length > 2) {
          ctx.beginPath();
          ctx.moveTo(det.segments[0][0] * canvas.width, det.segments[0][1] * canvas.height);
          for (let i = 1; i < det.segments.length; i++) {
            ctx.lineTo(det.segments[i][0] * canvas.width, det.segments[i][1] * canvas.height);
          }
          ctx.closePath();
          ctx.fillStyle = getDetectionFillColor(det.class);
          ctx.fill();
          ctx.strokeStyle = getDetectionColor(det.class);
          ctx.lineWidth = 1.5;
          ctx.stroke();
        }
      });

      // Draw boxes
      result.detections.forEach(det => {
        const [cx, cy, w, h] = det.bbox;
        const bx = (cx - w / 2) * canvas.width;
        const by = (cy - h / 2) * canvas.height;
        const bw = w * canvas.width;
        const bh = h * canvas.height;
        const color = getDetectionColor(det.class);

        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(bx, by, bw, bh);

        const label = `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
        ctx.font = '12px "JetBrains Mono", "SF Mono", monospace';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.85;
        ctx.fillRect(bx, by - 20, tw + 8, 20);
        ctx.globalAlpha = 1;
        ctx.fillStyle = '#000';
        ctx.fillText(label, bx + 4, by - 5);
      });
    };
    img.src = result.frameData;
  }, [result]);

  return <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />;
}