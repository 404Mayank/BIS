import { useState, useRef, useCallback, useEffect } from 'react';
import type { InferenceService, Detection } from '../services/inference-service';
import { getDetectionColor, getDetectionFillColor } from '../services/inference-service';

interface UseInferenceOptions {
  service: InferenceService;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  confidenceThreshold: number;
  enabled: boolean;
}

export function useInference({
  service,
  videoRef,
  canvasRef,
  confidenceThreshold,
  enabled,
}: UseInferenceOptions) {
  const [fps, setFps] = useState(0);
  const [inferenceTime, setInferenceTime] = useState(0);
  const [detections, setDetections] = useState<Detection[]>([]);

  const rafRef = useRef<number | null>(null);
  const lastFrameTime = useRef(0);
  const fpsBuffer = useRef<number[]>([]);

  const processFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !enabled) return;

    const ctx = canvas.getContext('2d');
    if (!ctx || video.readyState !== video.HAVE_ENOUGH_DATA) {
      rafRef.current = requestAnimationFrame(processFrame);
      return;
    }

    // FPS calculation with smoothing
    const now = performance.now();
    if (lastFrameTime.current) {
      const delta = now - lastFrameTime.current;
      const instantFps = 1000 / delta;
      fpsBuffer.current.push(instantFps);
      if (fpsBuffer.current.length > 10) fpsBuffer.current.shift();
      const avgFps = fpsBuffer.current.reduce((a: number, b: number) => a + b, 0) / fpsBuffer.current.length;
      setFps(Math.round(avgFps));
    }
    lastFrameTime.current = now;

    // Resize canvas to match video, clear for transparent overlay
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Run inference
    const result = service.runInference(video, confidenceThreshold);
    setDetections(result.detections);
    setInferenceTime(result.inferenceTimeMs);

    // Draw segmentation masks first (underneath bounding boxes)
    result.detections.forEach((det: Detection) => {
      if (det.segments && det.segments.length > 2) {
        const fillColor = getDetectionFillColor(det.class);
        const strokeColor = getDetectionColor(det.class);

        ctx.beginPath();
        const firstPt = det.segments[0];
        ctx.moveTo(firstPt[0] * canvas.width, firstPt[1] * canvas.height);

        for (let i = 1; i < det.segments.length; i++) {
          ctx.lineTo(det.segments[i][0] * canvas.width, det.segments[i][1] * canvas.height);
        }
        ctx.closePath();

        // Fill mask
        ctx.fillStyle = fillColor;
        ctx.fill();

        // Stroke outline
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });

    // Draw bounding boxes with rounded corners and labels
    result.detections.forEach((det: Detection) => {
      const [cx, cy, w, h] = det.bbox;
      const bx = (cx - w / 2) * canvas.width;
      const by = (cy - h / 2) * canvas.height;
      const bw = w * canvas.width;
      const bh = h * canvas.height;

      const color = getDetectionColor(det.class);
      const r = 4; // corner radius

      // Rounded rect box
      ctx.beginPath();
      ctx.moveTo(bx + r, by);
      ctx.lineTo(bx + bw - r, by);
      ctx.arcTo(bx + bw, by, bx + bw, by + r, r);
      ctx.lineTo(bx + bw, by + bh - r);
      ctx.arcTo(bx + bw, by + bh, bx + bw - r, by + bh, r);
      ctx.lineTo(bx + r, by + bh);
      ctx.arcTo(bx, by + bh, bx, by + bh - r, r);
      ctx.lineTo(bx, by + r);
      ctx.arcTo(bx, by, bx + r, by, r);
      ctx.closePath();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.stroke();

      // Subtle glow
      ctx.shadowColor = color;
      ctx.shadowBlur = 6;
      ctx.stroke();
      ctx.shadowBlur = 0;

      // Label
      const label = `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
      ctx.font = 'bold 12px "JetBrains Mono", "SF Mono", monospace';
      const textWidth = ctx.measureText(label).width;
      const lh = 20;

      // Rounded label background
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx, by - lh + r);
      ctx.arcTo(bx, by - lh, bx + r, by - lh, r);
      ctx.lineTo(bx + textWidth + 10 - r, by - lh);
      ctx.arcTo(bx + textWidth + 10, by - lh, bx + textWidth + 10, by - lh + r, r);
      ctx.lineTo(bx + textWidth + 10, by);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.9;
      ctx.fill();
      ctx.globalAlpha = 1;

      ctx.fillStyle = '#000';
      ctx.fillText(label, bx + 5, by - 5);
    });

    rafRef.current = requestAnimationFrame(processFrame);
  }, [enabled, confidenceThreshold, service, videoRef, canvasRef]);

  useEffect(() => {
    if (enabled) {
      lastFrameTime.current = 0;
      fpsBuffer.current = [];
      processFrame();
    } else {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Clear stale bounding boxes
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      setFps(0);
      setDetections([]);
    }

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [enabled, processFrame]);

  return { fps, inferenceTime, detections };
}