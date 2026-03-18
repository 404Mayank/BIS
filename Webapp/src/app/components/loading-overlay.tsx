import { useEffect, useState } from 'react';

interface LoadingOverlayProps {
  modelName: string;
}

export function LoadingOverlay({ modelName }: LoadingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);

  const stages = [
    'Allocating runtime...',
    'Loading weights...',
    'Building graph...',
    'Warming up...',
  ];

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        const next = prev + 2 + Math.random() * 3;
        if (next >= 95) {
          clearInterval(interval);
          return 95;
        }
        setStage(Math.min(Math.floor(next / 25), stages.length - 1));
        return next;
      });
    }, 80);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="fixed inset-0 bg-neutral-950/95 z-50 flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-sm">
        <div className="border border-neutral-700/50 bg-neutral-900/80 p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 bg-cyan-400 animate-pulse" />
            <span className="text-neutral-300 text-xs tracking-widest uppercase">
              Loading Model
            </span>
          </div>

          <p className="text-white text-sm mb-4">{modelName}</p>

          <div className="h-1 bg-neutral-700 mb-3">
            <div
              className="h-full bg-cyan-400 transition-all duration-150"
              style={{ width: `${progress}%` }}
            />
          </div>

          <div className="flex items-center justify-between">
            <span className="text-neutral-400 text-xs">
              {stages[stage]}
            </span>
            <span className="text-neutral-400 text-xs">
              {Math.floor(progress)}%
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}