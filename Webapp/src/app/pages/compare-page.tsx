import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, Camera } from 'lucide-react';
import { ModelCompare } from '../components/model-compare';
import { useCamera } from '../hooks/use-camera';
import { authFetch } from '../services/auth-service';
import type { ModelInfo } from '../services/inference-service';

export function ComparePage() {
  const navigate = useNavigate();
  const camera = useCamera();
  const [models, setModels] = useState<ModelInfo[]>([]);

  const fetchModels = useCallback(async () => {
    try {
      const response = await authFetch('/api/models');
      const data = await response.json();
      setModels(data);
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  }, []);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  useEffect(() => {
    if (!camera.isOn && camera.devices.length > 0) {
      camera.start();
    }
  }, [camera.devices]);

  return (
    <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono flex flex-col overflow-hidden">
      {/* Compact header */}
      <header className="flex items-center justify-between px-3 py-1.5 border-b border-[var(--border)] bg-[var(--bg-card)] shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-1 text-neutral-400 hover:text-white transition-colors text-xs px-2 py-1 border border-neutral-700/50 hover:border-neutral-600"
          >
            <ArrowLeft className="w-3 h-3" /> Back
          </button>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent)]" />
            <span className="text-sm tracking-wider">
              BIS <span className="text-[var(--text-muted)] text-[10px] tracking-widest">MODEL COMPARISON</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!camera.isOn ? (
            <button
              onClick={() => camera.start()}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-amber-900/30 border border-amber-700/40 text-amber-300"
            >
              <Camera className="w-3 h-3" /> Enable Camera
            </button>
          ) : (
            <div className="flex items-center gap-1.5">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
              <span className="text-emerald-400 text-[10px]">CAMERA READY</span>
            </div>
          )}
        </div>
      </header>

      {/* Hidden video for capture (opacity-0 prevents mobile browsers from pausing decode) */}
      <video ref={camera.videoRef} autoPlay playsInline muted className="fixed top-0 left-0 w-1 h-1 opacity-0 pointer-events-none" />

      {/* Compare fills everything */}
      <div className="flex-1 min-h-0 flex flex-col">
        <ModelCompare
          models={models}
          onClose={() => navigate('/')}
          videoRef={camera.videoRef}
          isCameraOn={camera.isOn}
        />
      </div>
    </div>
  );
}
