/**
 * Mock Inference Service
 * 
 * Simulates YOLO detection for UI development.
 * Replace with UltralyticsInferenceService for production.
 */

import type { InferenceService, InferenceResult } from './inference-service';

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
  private _loaded = false;

  async loadModel(_modelId: string): Promise<void> {
    // Simulate network + initialization delay
    await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 1200));
    this._loaded = true;
  }

  runInference(
    _videoElement: HTMLVideoElement,
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

    // Simulate realistic inference time (15-45ms)
    const elapsed = performance.now() - start;
    const simulatedTime = 15 + Math.random() * 30;

    return {
      detections,
      inferenceTimeMs: Math.max(elapsed, simulatedTime),
    };
  }

  dispose(): void {
    this._loaded = false;
  }
}
