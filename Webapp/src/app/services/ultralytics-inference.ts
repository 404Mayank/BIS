/**
 * Ultralytics Backend Inference Service
 * Communicates with FastAPI backend via WebSocket for real-time YOLO inference.
 */

import type { InferenceService, InferenceResult, CaptureResult, Detection } from './inference-service';
import { getToken } from './auth-service';

// Max dimension to resize frames to before sending (matches model imgsz)
const FRAME_MAX_DIM = 768;

export class UltralyticsInferenceService implements InferenceService {
  private ws: WebSocket | null = null;
  private baseUrl: string;
  private currentModel: string = '';
  private resizeCanvas: HTMLCanvasElement;
  private lastResult: InferenceResult = { detections: [], inferenceTimeMs: 0 };
  private pendingInference: boolean = false;
  private inferenceResolve: ((result: InferenceResult) => void) | null = null;

  // FPS tracking based on actual inference round-trips
  private lastResultTime: number = 0;
  private fpsBuffer: number[] = [];
  private currentFps: number = 0;

  // Reconnection state
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay: number = 1000;
  private maxReconnectDelay: number = 30000;
  private shouldReconnect: boolean = false;
  private onReconnect: (() => void) | null = null;

  // Capture mode
  private captureResolve: ((result: CaptureResult) => void) | null = null;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
    this.resizeCanvas = document.createElement('canvas');
  }

  /**
   * Resize a video/image element to fit within FRAME_MAX_DIM and return
   * a JPEG data URL. This dramatically reduces bandwidth to the server.
   */
  private getResizedFrame(
    el: HTMLVideoElement | HTMLImageElement,
    quality: number,
  ): string {
    const srcW = el instanceof HTMLVideoElement ? el.videoWidth : el.width;
    const srcH = el instanceof HTMLVideoElement ? el.videoHeight : el.height;

    // Calculate scale to fit within FRAME_MAX_DIM
    const scale = Math.min(1, FRAME_MAX_DIM / Math.max(srcW, srcH));
    const dstW = Math.round(srcW * scale);
    const dstH = Math.round(srcH * scale);

    this.resizeCanvas.width = dstW;
    this.resizeCanvas.height = dstH;
    const ctx = this.resizeCanvas.getContext('2d');
    if (!ctx) return '';
    ctx.drawImage(el, 0, 0, dstW, dstH);
    return this.resizeCanvas.toDataURL('image/jpeg', quality);
  }

  async loadModel(modelId: string): Promise<void> {
    this.currentModel = modelId;
    this.shouldReconnect = true;

    // Close existing connection
    if (this.ws) {
      this.shouldReconnect = false;
      this.ws.close();
      this.shouldReconnect = true;
    }

    return this._connect(modelId);
  }

  private _connect(modelId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        const token = getToken();
        const url = `${this.baseUrl}/ws/detect${token ? `?token=${token}` : ''}`;
        this.ws = new WebSocket(url);
      } catch (e) {
        this._scheduleReconnect(modelId, resolve);
        return;
      }

      let opened = false;

      this.ws.onopen = () => {
        opened = true;
        this.reconnectDelay = 1000;
        this.ws?.send(JSON.stringify({ action: 'load_model', model: modelId }));
        resolve();
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);

          // Handle model loaded confirmation
          if (data.status === 'model_loaded') {
            return;
          }

          // Handle capture result
          if (data.action === 'capture_result' && this.captureResolve) {
            this.captureResolve({
              detections: data.detections as Detection[],
              inferenceTimeMs: data.inference_time ?? 0,
              summary: data.summary ?? {},
              total: data.total ?? 0,
            });
            this.captureResolve = null;
            return;
          }

          if (data.detections) {
            const now = performance.now();
            if (this.lastResultTime) {
              const delta = now - this.lastResultTime;
              const instantFps = 1000 / delta;
              this.fpsBuffer.push(instantFps);
              if (this.fpsBuffer.length > 10) this.fpsBuffer.shift();
              this.currentFps = Math.round(
                this.fpsBuffer.reduce((a, b) => a + b, 0) / this.fpsBuffer.length
              );
            }
            this.lastResultTime = now;

            this.lastResult = {
              detections: data.detections as Detection[],
              inferenceTimeMs: data.inference_time ?? 0,
            };

            if (this.inferenceResolve) {
              this.inferenceResolve(this.lastResult);
              this.inferenceResolve = null;
            }
          }
        } catch (e) {
          console.error('Failed to parse inference result:', e);
        }
        this.pendingInference = false;
      };

      this.ws.onerror = () => {
        this.pendingInference = false;
      };

      this.ws.onclose = (event) => {
        this.pendingInference = false;
        if (!opened) {
          // Never connected — likely auth failure
          reject(new Error(`WebSocket rejected (code ${event.code})`));
          return;
        }
        if (this.shouldReconnect) {
          console.warn('WebSocket closed, attempting reconnect...');
          this._scheduleReconnect(modelId);
        }
      };
    });
  }

  private _scheduleReconnect(modelId: string, resolve?: (value: void) => void) {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);

    this.reconnectTimer = setTimeout(async () => {
      console.log(`Reconnecting in ${this.reconnectDelay}ms...`);
      try {
        await this._connect(modelId);
        if (this.onReconnect) this.onReconnect();
        if (resolve) resolve();
      } catch {
        // Will retry via onclose handler
      }
      // Exponential backoff
      this.reconnectDelay = Math.min(this.reconnectDelay * 2, this.maxReconnectDelay);
    }, this.reconnectDelay);
  }

  runInference(
    videoElement: HTMLVideoElement | HTMLImageElement,
    confidenceThreshold: number
  ): InferenceResult {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { detections: [], inferenceTimeMs: 0 };
    }

    // Skip if still waiting for previous response (frame skipping)
    if (this.pendingInference) {
      return this.lastResult;
    }

    // Resize to 768px max & JPEG compress at quality 0.7 for bandwidth
    const frameData = this.getResizedFrame(videoElement, 0.7);
    if (!frameData) return this.lastResult;

    this.pendingInference = true;
    this.ws.send(JSON.stringify({
      action: 'detect',
      frame: frameData,
      conf: confidenceThreshold,
      model: this.currentModel,
    }));

    // Return last result immediately (will have new result next frame)
    return this.lastResult;
  }

  getFps(): number {
    return this.currentFps;
  }

  async captureFrame(
    videoElement: HTMLVideoElement | HTMLImageElement,
    confidenceThreshold: number
  ): Promise<CaptureResult> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return { detections: [], inferenceTimeMs: 0, summary: {}, total: 0 };
    }

    // Higher quality JPEG (0.9) for captures, still resized to 768px
    const frameData = this.getResizedFrame(videoElement, 0.9);
    if (!frameData) return { detections: [], inferenceTimeMs: 0, summary: {}, total: 0 };

    return new Promise((resolve) => {
      this.captureResolve = (result) => resolve({ ...result, frameData });
      this.ws!.send(JSON.stringify({
        action: 'capture',
        frame: frameData,
        conf: confidenceThreshold,
        model: this.currentModel,
      }));

      // Timeout after 30s (GPU cold start can be slow)
      setTimeout(() => {
        if (this.captureResolve) {
          this.captureResolve({ detections: [], inferenceTimeMs: 0, summary: {}, total: 0 });
          this.captureResolve = null;
        }
      }, 30000);
    });
  }

  dispose(): void {
    this.shouldReconnect = false;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
