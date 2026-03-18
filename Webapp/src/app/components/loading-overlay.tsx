import { useEffect, useState } from 'react';
import { Loader2, Cpu, HardDrive, Zap, Server } from 'lucide-react';

interface LoadingOverlayProps {
  modelName: string;
  isConnecting?: boolean; // true when WebSocket hasn't connected yet
}

export function LoadingOverlay({ modelName, isConnecting }: LoadingOverlayProps) {
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  // Serverless-aware stages
  const stages = isConnecting
    ? [
        { text: 'Waking up server…', icon: Server, hint: 'Serverless cold start' },
        { text: 'Connecting to backend…', icon: Zap, hint: 'Establishing WebSocket' },
        { text: 'Loading model weights…', icon: HardDrive, hint: 'From cloud storage' },
        { text: 'Allocating GPU…', icon: Cpu, hint: 'NVIDIA T4' },
        { text: 'Warming up pipeline…', icon: Zap, hint: 'Almost ready' },
      ]
    : [
        { text: 'Loading model weights…', icon: HardDrive, hint: 'From cloud storage' },
        { text: 'Allocating GPU…', icon: Cpu, hint: 'NVIDIA T4' },
        { text: 'Building inference graph…', icon: Zap, hint: 'Optimizing' },
        { text: 'Warming up pipeline…', icon: Zap, hint: 'Almost ready' },
      ];

  // Elapsed time counter
  useEffect(() => {
    const timer = setInterval(() => setElapsed(e => e + 1), 1000);
    return () => clearInterval(timer);
  }, []);

  // Progress simulation — slow at first (cold start), then speeds up
  useEffect(() => {
    const interval = setInterval(() => {
      setProgress(prev => {
        // Slow ramp: first 30% takes longer (simulates cold start), then accelerates
        const speed = prev < 30 ? 0.8 + Math.random() * 1.2 : 2 + Math.random() * 3;
        const next = prev + speed;
        if (next >= 95) {
          clearInterval(interval);
          return 95;
        }
        setStage(Math.min(Math.floor(next / (100 / stages.length)), stages.length - 1));
        return next;
      });
    }, 150);
    return () => clearInterval(interval);
  }, [stages.length]);

  const currentStage = stages[stage];
  const Icon = currentStage.icon;

  return (
    <div className="fixed inset-0 bg-neutral-950/95 z-50 flex items-center justify-center p-4 font-mono">
      <div className="w-full max-w-sm">
        <div className="border border-neutral-700/50 bg-neutral-900/80 p-6">
          {/* Header */}
          <div className="flex items-center gap-3 mb-6">
            <div className="w-2 h-2 bg-cyan-400 animate-pulse" />
            <span className="text-neutral-300 text-xs tracking-widest uppercase">
              {isConnecting ? 'Starting Server' : 'Loading Model'}
            </span>
            <span className="ml-auto text-neutral-600 text-[10px] tabular-nums">
              {elapsed}s
            </span>
          </div>

          {/* Model name */}
          <p className="text-white text-sm mb-4 flex items-center gap-2">
            <span className="text-neutral-400 text-xs">▸</span>
            {modelName}
          </p>

          {/* Progress bar */}
          <div className="h-1.5 bg-neutral-800 mb-4 overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-cyan-500 to-cyan-400 transition-all duration-300 ease-out relative"
              style={{ width: `${progress}%` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
            </div>
          </div>

          {/* Current stage */}
          <div className="flex items-center gap-2 mb-3">
            <Icon className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
            <span className="text-neutral-300 text-xs">{currentStage.text}</span>
          </div>

          {/* Hint */}
          <div className="flex items-center justify-between">
            <span className="text-neutral-600 text-[10px]">{currentStage.hint}</span>
            <span className="text-neutral-500 text-[10px] tabular-nums">{Math.floor(progress)}%</span>
          </div>

          {/* Cold start disclaimer */}
          {isConnecting && elapsed > 5 && (
            <div className="mt-4 pt-3 border-t border-neutral-800">
              <p className="text-neutral-600 text-[10px] leading-relaxed">
                First request wakes up the serverless GPU. Subsequent requests will be instant.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Compact connection status banner — shown at the top when
 * WebSocket is connecting/reconnecting (not during initial model load).
 */
export function ConnectionBanner({ state }: { state: 'connecting' | 'reconnecting' | 'connected' | 'error' }) {
  if (state === 'connected') return null;

  const config = {
    connecting: { text: 'Connecting to server…', color: 'bg-amber-500/10 border-amber-700/30 text-amber-400' },
    reconnecting: { text: 'Reconnecting…', color: 'bg-amber-500/10 border-amber-700/30 text-amber-400' },
    error: { text: 'Connection lost', color: 'bg-red-500/10 border-red-700/30 text-red-400' },
  };

  const { text, color } = config[state];

  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 border text-[10px] tracking-wider uppercase ${color} mb-2 shrink-0`}>
      <Loader2 className="w-3 h-3 animate-spin" />
      <span>{text}</span>
      <span className="ml-auto text-[9px] opacity-60">Serverless cold start — may take 10-30s</span>
    </div>
  );
}