/**
 * Inference Service Abstraction
 */

export interface Detection {
  class: string;
  confidence: number;
  bbox: [number, number, number, number]; // [cx, cy, w, h] normalized 0-1 (YOLO xywhn center format)
  segments?: [number, number][]; // Polygon points [[x,y], ...] normalized 0-1
}

export interface ModelInfo {
  id: string;
  name: string;
  endpoint: string;
  size: string;
}

export interface InferenceResult {
  detections: Detection[];
  inferenceTimeMs: number;
}

export interface CaptureResult extends InferenceResult {
  summary: Record<string, number>;
  total: number;
  frameData?: string;
}

export interface InferenceService {
  loadModel(modelId: string): Promise<void>;
  runInference(
    videoElement: HTMLVideoElement,
    confidenceThreshold: number
  ): InferenceResult;
  captureFrame(
    videoElement: HTMLVideoElement,
    confidenceThreshold: number
  ): Promise<CaptureResult>;
  dispose(): void;
}

// --- Detection class colors for blister pack QC ---
// Model classes: Blister (structure), Empty (missing pill), Full (pill present)
export const DETECTION_CLASSES: Record<string, { color: string; fillColor: string; severity: 'ok' | 'warn' | 'critical' }> = {
  'Blister': { color: '#06b6d4', fillColor: 'rgba(6, 182, 212, 0.15)', severity: 'ok' },
  'Empty': { color: '#ef4444', fillColor: 'rgba(239, 68, 68, 0.25)', severity: 'critical' },
  'Full': { color: '#22c55e', fillColor: 'rgba(34, 197, 94, 0.15)', severity: 'ok' },
};

export function getDetectionColor(className: string): string {
  return DETECTION_CLASSES[className]?.color ?? '#6b7280';
}

export function getDetectionFillColor(className: string): string {
  return DETECTION_CLASSES[className]?.fillColor ?? 'rgba(107, 114, 128, 0.15)';
}

export function getDetectionSeverity(className: string): 'ok' | 'warn' | 'critical' {
  return DETECTION_CLASSES[className]?.severity ?? 'warn';
}
