import { Detection, getDetectionColor } from '../services/inference-service';

interface DetectionsListProps {
  detections: Detection[];
}

export function DetectionsList({ detections }: DetectionsListProps) {
  const grouped = detections.reduce((acc, d) => {
    if (!acc[d.class]) acc[d.class] = [];
    acc[d.class].push(d);
    return acc;
  }, {} as Record<string, Detection[]>);

  const sorted = Object.entries(grouped).sort(([, a], [, b]) => b.length - a.length);

  const emptyCount = detections.filter(d => d.class.toLowerCase() === 'empty').length;
  const fullCount = detections.filter(d => d.class.toLowerCase() === 'full').length;

  return (
    <div className="border border-neutral-700/50 bg-neutral-900/80">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50 bg-neutral-800/40">
        <span className="text-cyan-400/70 text-[10px] tracking-widest uppercase">
          Detections
        </span>
        <div className="flex items-center gap-2">
          {emptyCount > 0 && (
            <span className="text-red-400 text-[10px]">{emptyCount} MISSING</span>
          )}
          {fullCount > 0 && (
            <span className="text-emerald-400 text-[10px]">{fullCount} OK</span>
          )}
          <span className="text-neutral-500 text-[10px]">{detections.length} total</span>
        </div>
      </div>

      <div className="max-h-[220px] lg:max-h-[300px] overflow-y-auto">
        {detections.length === 0 ? (
          <div className="px-3 py-8 text-center">
            <p className="text-neutral-600 text-xs">Waiting for detections...</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-700/30">
            {sorted.map(([className, items]) => {
              const color = getDetectionColor(className);
              const avgConf = items.reduce((s, i) => s + i.confidence, 0) / items.length;

              return (
                <div
                  key={className}
                  className="flex items-center justify-between px-3 py-2 hover:bg-neutral-800/40 transition-colors"
                >
                  <div className="flex items-center gap-2.5">
                    <div className="w-2 h-2 rounded-sm" style={{ backgroundColor: color }} />
                    <span className="text-neutral-200 text-xs capitalize">{className}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-neutral-500 text-[10px]">{(avgConf * 100).toFixed(0)}%</span>
                    <span className="text-xs min-w-[20px] text-right" style={{ color }}>
                      {items.length}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}