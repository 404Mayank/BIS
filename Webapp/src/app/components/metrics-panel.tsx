interface MetricsPanelProps {
  fps: number;
  inferenceTime: number;
  isRunning: boolean;
  detectionCount: number;
}

export function MetricsPanel({ fps, inferenceTime, isRunning, detectionCount }: MetricsPanelProps) {
  const fpsStatus = !isRunning ? 'idle' : fps > 25 ? 'good' : fps > 15 ? 'warn' : 'bad';
  const latencyStatus = !isRunning ? 'idle' : inferenceTime < 40 ? 'good' : inferenceTime < 80 ? 'warn' : 'bad';

  const statusColor = {
    idle: 'text-neutral-600',
    good: 'text-emerald-400',
    warn: 'text-amber-400',
    bad: 'text-red-400',
  };

  const dotColor = {
    idle: 'bg-neutral-700',
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    bad: 'bg-red-500',
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-neutral-700/30 border border-neutral-700/50">
      <Metric
        label="FPS"
        value={isRunning ? String(fps) : '--'}
        dotClass={dotColor[fpsStatus]}
        valueClass={statusColor[fpsStatus]}
      />
      <Metric
        label="LATENCY"
        value={isRunning ? `${inferenceTime.toFixed(0)}ms` : '--'}
        dotClass={dotColor[latencyStatus]}
        valueClass={statusColor[latencyStatus]}
      />
      <Metric
        label="OBJECTS"
        value={isRunning ? String(detectionCount) : '--'}
        dotClass={isRunning ? 'bg-blue-500' : 'bg-neutral-700'}
        valueClass={isRunning ? 'text-blue-400' : 'text-neutral-600'}
      />
      <Metric
        label="STATUS"
        value={isRunning ? 'LIVE' : 'IDLE'}
        dotClass={isRunning ? 'bg-emerald-500' : 'bg-neutral-700'}
        valueClass={isRunning ? 'text-emerald-400' : 'text-neutral-600'}
        pulse={isRunning}
      />
    </div>
  );
}

function Metric({
  label,
  value,
  dotClass,
  valueClass,
  pulse,
}: {
  label: string;
  value: string;
  dotClass: string;
  valueClass: string;
  pulse?: boolean;
}) {
  return (
    <div className="bg-neutral-900/80 px-3 py-2.5 flex flex-col items-center gap-1">
      <div className="flex items-center gap-1.5">
        <div className={`w-1.5 h-1.5 rounded-full ${dotClass} ${pulse ? 'animate-pulse' : ''}`} />
        <span className="text-neutral-400 text-[10px] tracking-widest uppercase">
          {label}
        </span>
      </div>
      <span className={`text-sm ${valueClass}`}>
        {value}
      </span>
    </div>
  );
}