import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowLeftRight, Loader2, Plus, X } from 'lucide-react';
import type { ModelInfo, Detection, CaptureResult } from '../services/inference-service';
import { getDetectionColor, getDetectionFillColor } from '../services/inference-service';
import { UltralyticsInferenceService } from '../services/ultralytics-inference';

interface ModelCompareProps {
  models: ModelInfo[];
  onClose: () => void;
  videoRef: React.RefObject<HTMLVideoElement | null>;
  isCameraOn: boolean;
}

interface CompareSlot {
  id: string;
  modelId: string;
  result: CaptureResult | null;
  isLoading: boolean;
}

let slotCounter = 0;

export function ModelCompare({ models, onClose, videoRef, isCameraOn }: ModelCompareProps) {
  const [slots, setSlots] = useState<CompareSlot[]>([
    { id: `slot-${slotCounter++}`, modelId: '', result: null, isLoading: false },
    { id: `slot-${slotCounter++}`, modelId: '', result: null, isLoading: false },
  ]);
  const [isComparing, setIsComparing] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25);
  const [compareStatus, setCompareStatus] = useState<string>('');

  const servicesRef = useRef<Map<string, UltralyticsInferenceService>>(new Map());

  const getService = useCallback((slotId: string) => {
    if (!servicesRef.current.has(slotId)) {
      const wsUrl = import.meta.env.VITE_WS_URL || 'ws://localhost:8000';
      servicesRef.current.set(slotId, new UltralyticsInferenceService(wsUrl));
    }
    return servicesRef.current.get(slotId)!;
  }, []);

  const addSlot = () => {
    setSlots(prev => [...prev, {
      id: `slot-${slotCounter++}`,
      modelId: '',
      result: null,
      isLoading: false,
    }]);
  };

  const removeSlot = (id: string) => {
    if (slots.length <= 2) return;
    const service = servicesRef.current.get(id);
    if (service) service.dispose();
    servicesRef.current.delete(id);
    setSlots(prev => prev.filter(s => s.id !== id));
  };

  const updateSlotModel = (id: string, modelId: string) => {
    setSlots(prev => prev.map(s => s.id === id ? { ...s, modelId, result: null } : s));
  };

  const runComparison = useCallback(async () => {
    if (!videoRef.current || !isCameraOn) return;
    const validSlots = slots.filter(s => s.modelId);
    if (validSlots.length < 2) return;

    setIsComparing(true);
    setSlots(prev => prev.map(s => ({ ...s, result: null, isLoading: !!s.modelId })));

    try {
      // Stage 1: Load models
      setCompareStatus(`Loading ${validSlots.length} models…`);
      await Promise.all(
        validSlots.map(async slot => {
          const service = getService(slot.id);
          await service.loadModel(slot.modelId);
        })
      );

      // Stage 2: Capture frame
      setCompareStatus('Capturing frame…');
      await new Promise(r => setTimeout(r, 500));

      // Stage 3: Run inference
      setCompareStatus('Running inference on all models…');
      const results = await Promise.all(
        validSlots.map(async slot => {
          const service = getService(slot.id);
          const result = await service.captureFrame(videoRef.current!, confidenceThreshold);
          return { slotId: slot.id, result };
        })
      );

      setSlots(prev => prev.map(s => {
        const found = results.find(r => r.slotId === s.id);
        return found ? { ...s, result: found.result, isLoading: false } : { ...s, isLoading: false };
      }));
    } catch (err) {
      console.error('Comparison failed:', err);
      setSlots(prev => prev.map(s => ({ ...s, isLoading: false })));
    } finally {
      setIsComparing(false);
      setCompareStatus('');
    }
  }, [slots, videoRef, isCameraOn, getService, confidenceThreshold]);

  const validCount = slots.filter(s => s.modelId).length;
  const hasResults = slots.some(s => s.result);

  const allDetectedClasses = Array.from(
    new Set(
      slots
        .filter(s => s.result)
        .flatMap(s => Object.keys(s.result!.summary))
    )
  ).sort();

  // Grid layout: 2 cols for 2-3 models, 3 cols for 4+, always responsive
  const cols = slots.length <= 3 ? 'lg:grid-cols-2' : 'lg:grid-cols-3 xl:grid-cols-4';

  return (
    <div className="flex flex-col h-full">
      {/* Toolbar — compact, inline */}
      <div className="shrink-0 border-b border-[var(--border)] bg-[var(--bg-card)] px-3 py-2">
        <div className="flex items-center gap-2 flex-wrap">
          {/* Model selectors inline */}
          {slots.map((slot, i) => (
            <div key={slot.id} className="flex items-center gap-1 shrink-0">
              <select
                value={slot.modelId}
                onChange={(e) => updateSlotModel(slot.id, e.target.value)}
                className="bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-xs px-2 py-1.5 focus:outline-none focus:border-[var(--accent)] min-w-[120px] max-w-[180px]"
              >
                <option value="">Model {i + 1}...</option>
                {models.filter(m =>
                  m.id === slot.modelId || !slots.some(s => s.id !== slot.id && s.modelId === m.id)
                ).map(m => (
                  <option key={m.id} value={m.id}>{m.name} ({m.size})</option>
                ))}
              </select>
              {slots.length > 2 && (
                <button
                  onClick={() => removeSlot(slot.id)}
                  className="p-1 text-neutral-600 hover:text-red-400 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}

          {/* Add slot */}
          <button
            onClick={addSlot}
            className="p-1.5 text-emerald-500 hover:text-emerald-300 border border-emerald-700/30 hover:border-emerald-600/50 transition-colors"
            title="Add model"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Compare button */}
          <button
            onClick={runComparison}
            disabled={validCount < 2 || isComparing || !isCameraOn}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-cyan-900/50 hover:bg-cyan-800/60 border border-cyan-600/40 text-cyan-300 text-xs tracking-wider uppercase transition-colors disabled:opacity-30 disabled:cursor-not-allowed shrink-0"
          >
            {isComparing ? (
              <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Running...</>
            ) : (
              <><ArrowLeftRight className="w-3.5 h-3.5" /> Compare ({validCount})</>
            )}
          </button>
        </div>

        {!isCameraOn && (
          <p className="text-amber-400/60 text-[10px] mt-1">Enable camera to capture comparison frames</p>
        )}

        {/* Threshold slider */}
        <div className="flex items-center gap-3 mt-2">
          <label className="text-[var(--text-muted)] text-[10px] tracking-wider uppercase shrink-0">
            Threshold: {(confidenceThreshold * 100).toFixed(0)}%
          </label>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={confidenceThreshold}
            onChange={(e) => setConfidenceThreshold(parseFloat(e.target.value))}
            className="flex-1 h-1 bg-neutral-700 appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-3
              [&::-webkit-slider-thumb]:h-3
              [&::-webkit-slider-thumb]:rounded-none
              [&::-webkit-slider-thumb]:bg-cyan-400
              [&::-webkit-slider-thumb]:border-0
              [&::-moz-range-thumb]:w-3
              [&::-moz-range-thumb]:h-3
              [&::-moz-range-thumb]:rounded-none
              [&::-moz-range-thumb]:bg-cyan-400
              [&::-moz-range-thumb]:border-0"
          />
        </div>
      </div>

      {/* Results area — fills remaining space */}
      <div className="flex-1 min-h-0 overflow-y-auto p-2 flex flex-col gap-2">
        {!hasResults && !isComparing ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <ArrowLeftRight className="w-10 h-10 mx-auto text-neutral-700" />
              <p className="text-neutral-500 text-sm">Select models and click Compare</p>
              <p className="text-neutral-600 text-xs">Each model will analyze the same camera frame</p>
            </div>
          </div>
        ) : isComparing && !hasResults ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="w-8 h-8 mx-auto text-cyan-400 animate-spin" />
              <p className="text-cyan-300 text-sm">{compareStatus || 'Comparing…'}</p>
              <p className="text-neutral-600 text-[10px]">This may take a moment if the GPU is cold-starting</p>
            </div>
          </div>
        ) : (
          <>
            <div className={`grid grid-cols-1 sm:grid-cols-2 ${cols} gap-2 min-h-[300px] flex-1`}>
              {slots.filter(s => s.result || s.isLoading).map(slot => (
                <ComparePanel
                  key={slot.id}
                  label={models.find(m => m.id === slot.modelId)?.name || slot.modelId}
                  result={slot.result}
                  isLoading={slot.isLoading}
                />
              ))}
            </div>

            {hasResults && allDetectedClasses.length > 0 && (
              <div className="shrink-0 bg-neutral-900/80 border border-neutral-700/50">
                <div className="px-3 py-2 border-b border-neutral-700/50 bg-neutral-800/40">
                  <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">Detection Summary</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs text-neutral-300 whitespace-nowrap">
                    <thead className="bg-neutral-800/20 text-neutral-500 uppercase tracking-wider text-[10px]">
                      <tr>
                        <th className="px-3 py-2 font-medium border-b border-neutral-700/50">Class</th>
                        {slots.filter(s => s.result || s.isLoading).map(slot => (
                          <th key={slot.id} className="px-3 py-2 font-medium border-b border-neutral-700/50">
                            {models.find(m => m.id === slot.modelId)?.name || slot.modelId}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-800/50">
                      {allDetectedClasses.map(cls => (
                        <tr key={cls} className="hover:bg-neutral-800/30">
                          <td className="px-3 py-1.5 flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-sm" style={{ backgroundColor: getDetectionColor(cls) }} />
                            {cls}
                          </td>
                          {slots.filter(s => s.result || s.isLoading).map(slot => (
                            <td key={slot.id} className="px-3 py-1.5 font-mono tabular-nums">
                              {slot.result ? (slot.result.summary[cls] || 0) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                      <tr className="bg-neutral-800/30 font-bold">
                        <td className="px-3 py-2 text-[10px] tracking-widest text-neutral-400">TOTAL</td>
                        {slots.filter(s => s.result || s.isLoading).map(slot => (
                          <td key={slot.id} className="px-3 py-2 font-mono tabular-nums text-cyan-400">
                            {slot.result ? slot.result.total : '-'}
                          </td>
                        ))}
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ComparePanel({
  label,
  result,
  isLoading,
}: {
  label: string;
  result: CaptureResult | null;
  isLoading: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!result || !result.frameData || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const img = new window.Image();
    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      drawDetectionsOverlay(ctx, canvas, result.detections);
    };
    img.src = result.frameData;
  }, [result]);

  return (
    <div className="border border-neutral-700/40 bg-neutral-900/50 flex flex-col min-h-0">
      {/* Header with label + stats */}
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-neutral-700/40 bg-neutral-800/40 shrink-0">
        <span className="text-cyan-400/80 text-[10px] tracking-widest uppercase font-bold">{label}</span>
        {result && (
          <div className="flex items-center gap-2">
            {Object.entries(result.summary).map(([cls, count]) => (
              <span key={cls} className="text-[10px] flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-sm" style={{ backgroundColor: getDetectionColor(cls) }} />
                <span style={{ color: getDetectionColor(cls) }}>{count}</span>
              </span>
            ))}
            <span className="text-neutral-600 text-[10px]">{result.inferenceTimeMs.toFixed(0)}ms</span>
          </div>
        )}
      </div>

      {/* Canvas fills panel */}
      <div className="flex-1 relative bg-neutral-950 min-h-0">
        {isLoading && (
          <div className="absolute inset-0 flex items-center justify-center z-10">
            <Loader2 className="w-6 h-6 text-cyan-400 animate-spin" />
          </div>
        )}
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full object-contain" />
      </div>
    </div>
  );
}

function drawDetectionsOverlay(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  detections: Detection[]
) {
  // Draw masks
  detections.forEach(det => {
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
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  // Draw boxes with rounded corners
  detections.forEach(det => {
    const [cx, cy, w, h] = det.bbox;
    const bx = (cx - w / 2) * canvas.width;
    const by = (cy - h / 2) * canvas.height;
    const bw = w * canvas.width;
    const bh = h * canvas.height;
    const color = getDetectionColor(det.class);
    const r = 3;

    // Rounded box
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
    ctx.shadowColor = color;
    ctx.shadowBlur = 4;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Label
    const label = `${det.class} ${(det.confidence * 100).toFixed(0)}%`;
    ctx.font = 'bold 11px monospace';
    const tw = ctx.measureText(label).width;
    const lh = 16;

    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.lineTo(bx, by - lh + r);
    ctx.arcTo(bx, by - lh, bx + r, by - lh, r);
    ctx.lineTo(bx + tw + 8 - r, by - lh);
    ctx.arcTo(bx + tw + 8, by - lh, bx + tw + 8, by - lh + r, r);
    ctx.lineTo(bx + tw + 8, by);
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
    ctx.fillStyle = '#000';
    ctx.fillText(label, bx + 4, by - 3);
  });
}
