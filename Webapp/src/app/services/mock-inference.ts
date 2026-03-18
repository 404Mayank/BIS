/**
 * Mock Inference Service
 * 
 * Simulates YOLO detection for UI development.
 * Replace with UltralyticsInferenceService for production.
 */

import type { InferenceService, InferenceResult, CaptureResult } from './inference-service';

const CLASSES = ['good pill', 'missing pill', 'broken pill', 'empty pocket', 'color defect'];
const CLASS_WEIGHTS = [0.4, 0.15, 0.15, 0.15, 0.15]; // good pills more common

function weightedRandomClass(): string {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < CLASSES.length; i++) {
    cumulative += CLASS_WEIGHTS[i];
    if (r <= cumulative) return CLASSES[i];
  }
  return CLASSES[0];
}

export class MockInferenceService implements InferenceService {

  async loadModel(_modelId: string): Promise<void> {
    // Simulate network + initialization delay
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
  }

  runInference(
    _videoElement: HTMLVideoElement | HTMLImageElement,
    confidenceThreshold: number
  ): InferenceResult {
    const start = performance.now();

    const detections: InferenceResult['detections'] = [];
    const count = Math.floor(Math.random() * 5) + 1;

    for (let i = 0; i < count; i++) {
      const confidence = Math.random() * 0.45 + 0.55; // 0.55 - 1.0
      if (confidence >= confidenceThreshold) {
        detections.push({
          class: weightedRandomClass(),
          confidence,
          bbox: [
            Math.random() * 0.6 + 0.05,
            Math.random() * 0.5 + 0.05,
            Math.random() * 0.2 + 0.08,
            Math.random() * 0.2 + 0.08,
          ],
        });
      }
    }

    const elapsed = performance.now() - start;

    return {
      detections,
      inferenceTimeMs: elapsed,
    };
  }

  getFps(): number {
    return 30; // Mock FPS
  }

  async captureFrame(
    videoElement: HTMLVideoElement | HTMLImageElement,
    confidenceThreshold: number
  ): Promise<CaptureResult> {
    const result = await this.runInference(videoElement, confidenceThreshold);
    return {
      ...result,
      summary: {},
      total: result.detections.length,
    };
  }

  dispose(): void {
  }
}
