import React from 'react';
import { Camera, CameraOff, Play, Square, Sun, Moon, ArrowLeftRight, Pencil, Trash2 } from 'lucide-react';
import type { ModelInfo } from '../services/inference-service';
import type { CameraDevice } from '../hooks/use-camera';
import { authFetch, isAdmin as checkIsAdmin } from '../services/auth-service';

interface ControlsProps {
  models: ModelInfo[];
  selectedModel: string;
  onModelChange: (modelId: string) => void;
  isModelLoaded: boolean;
  isCameraOn: boolean;
  onCameraToggle: () => void;
  isRunning: boolean;
  onInferenceToggle: () => void;
  confidenceThreshold: number;
  onConfidenceChange: (value: number) => void;
  cameras: CameraDevice[];
  activeCamera: string;
  onCameraSwitch: (deviceId: string) => void;
  cameraError: string | null;
  onModelUploaded: () => void;
  theme: 'dark' | 'light';
  onThemeToggle: () => void;
  onCompareOpen: () => void;
}

export function YoloControls({
  models,
  selectedModel,
  onModelChange,
  isModelLoaded,
  isCameraOn,
  onCameraToggle,
  isRunning,
  onInferenceToggle,
  confidenceThreshold,
  onConfidenceChange,
  cameras,
  activeCamera,
  onCameraSwitch,
  cameraError,
  onModelUploaded,
  theme,
  onThemeToggle,
  onCompareOpen,
}: ControlsProps) {
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = React.useState(false);
  const [renamingModel, setRenamingModel] = React.useState<string | null>(null);
  const [renameValue, setRenameValue] = React.useState('');
  const userIsAdmin = checkIsAdmin();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await authFetch('/api/models/upload', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        throw new Error(await res.text());
      }

      onModelUploaded();
    } catch (err) {
      console.error('Upload failed:', err);
      alert('Failed to upload model. Ensure it is a .pt file.');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRename = async (modelId: string) => {
    if (!renameValue.trim()) return;
    try {
      const res = await authFetch(`/api/models/${modelId}/rename`, {
        method: 'PATCH',
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      if (res.ok) {
        setRenamingModel(null);
        onModelUploaded(); // refresh list
      }
    } catch (err) {
      console.error('Rename failed:', err);
    }
  };

  const handleDelete = async (modelId: string) => {
    if (!confirm(`Delete model "${modelId}"? This cannot be undone.`)) return;
    try {
      const res = await authFetch(`/api/models/${modelId}`, { method: 'DELETE' });
      if (res.ok) onModelUploaded();
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  return (
    <div className="border border-neutral-700/50 bg-[var(--bg-card)]">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50 bg-[var(--bg-card-header)]">
        <span className="text-[var(--accent-muted)] text-[10px] tracking-widest uppercase">
          Controls
        </span>
        <div className="flex items-center gap-2">
          <button
            onClick={onThemeToggle}
            className="p-1 hover:bg-neutral-700/30 rounded transition-colors"
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            {theme === 'dark' ? (
              <Sun className="w-3.5 h-3.5 text-amber-400" />
            ) : (
              <Moon className="w-3.5 h-3.5 text-indigo-400" />
            )}
          </button>
          <div className={`w-1.5 h-1.5 rounded-full ${isModelLoaded ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'}`} />
          <span className={`text-[10px] ${isModelLoaded ? 'text-emerald-500' : 'text-amber-500'}`}>
            {isModelLoaded ? 'READY' : 'LOADING'}
          </span>
        </div>
      </div>

      <div className="p-3 space-y-3">
        {/* Model Select */}
        <ControlGroup label="Model">
          <div className="flex flex-col gap-2">
            <select
              value={selectedModel}
              onChange={(e) => onModelChange(e.target.value)}
              className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-xs px-2.5 py-2 focus:outline-none focus:border-[var(--accent)] appearance-none cursor-pointer transition-colors"
            >
              {models.length === 0 && <option value="">No models found</option>}
              {models.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.size})
                </option>
              ))}
            </select>

            <div className="flex items-center justify-between gap-2">
              {/* Model management buttons (admin only) */}
              {userIsAdmin && selectedModel ? (
                renamingModel === selectedModel ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      value={renameValue}
                      onChange={e => setRenameValue(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleRename(selectedModel)}
                      className="w-24 bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-[10px] px-1.5 py-1 focus:outline-none focus:border-[var(--accent)]"
                      placeholder="New name"
                      autoFocus
                    />
                    <button onClick={() => handleRename(selectedModel)} className="text-emerald-400 text-[10px] px-1 hover:text-emerald-300">✓</button>
                    <button onClick={() => setRenamingModel(null)} className="text-[var(--text-muted)] text-[10px] px-1 hover:text-[var(--text-primary)]">✕</button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => { setRenamingModel(selectedModel); setRenameValue(''); }}
                      className="p-1.5 text-[var(--text-muted)] hover:text-cyan-400 transition-colors"
                      title="Rename model"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(selectedModel)}
                      className="p-1.5 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                      title="Delete model"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )
              ) : (
                <div /> /* Empty spacer */
              )}

              <div className="flex shrink-0">
                <input
                  type="file"
                  accept=".pt"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className="px-3 py-1.5 bg-[var(--bg-card-header)] hover:bg-[var(--bg-card)] border border-[var(--border)] text-xs text-[var(--text-primary)] disabled:opacity-50 transition-colors"
                  title="Import Model (.pt)"
                >
                  {isUploading ? 'Uploading...' : 'Import'}
                </button>
              </div>
            </div>
          </div>
        </ControlGroup>

        {/* Camera Select */}
        <ControlGroup label="Camera">
          <select
            value={activeCamera}
            onChange={(e) => onCameraSwitch(e.target.value)}
            className="w-full bg-[var(--bg-primary)] border border-[var(--border)] text-[var(--text-primary)] text-xs px-2.5 py-2 focus:outline-none focus:border-cyan-500/40 appearance-none cursor-pointer transition-colors"
          >
            {cameras.length === 0 ? (
              <option value="">No cameras found</option>
            ) : (
              cameras.map(c => (
                <option key={c.deviceId} value={c.deviceId}>
                  {c.label}
                </option>
              ))
            )}
          </select>
          {cameraError && (
            <p className="text-red-400 text-[10px] mt-1">{cameraError}</p>
          )}
        </ControlGroup>

        {/* Confidence */}
        <ControlGroup label={`Threshold: ${(confidenceThreshold * 100).toFixed(0)}%`}>
          <input
            type="range"
            min={0.1}
            max={1.0}
            step={0.05}
            value={confidenceThreshold}
            onChange={(e) => onConfidenceChange(parseFloat(e.target.value))}
            className="w-full h-1 sm:h-1 bg-neutral-700 appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:sm:w-3
              [&::-webkit-slider-thumb]:sm:h-3
              [&::-webkit-slider-thumb]:rounded-none
              [&::-webkit-slider-thumb]:bg-cyan-400
              [&::-webkit-slider-thumb]:border-0
              [&::-moz-range-thumb]:w-4
              [&::-moz-range-thumb]:h-4
              [&::-moz-range-thumb]:sm:w-3
              [&::-moz-range-thumb]:sm:h-3
              [&::-moz-range-thumb]:rounded-none
              [&::-moz-range-thumb]:bg-cyan-400
              [&::-moz-range-thumb]:border-0"
          />
          <div className="flex justify-between mt-1">
            <span className="text-[var(--text-muted)] text-[10px]">10%</span>
            <span className="text-[var(--text-muted)] text-[10px]">100%</span>
          </div>
        </ControlGroup>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <button
            onClick={onCameraToggle}
            disabled={!isModelLoaded}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 text-xs border transition-colors disabled:opacity-30 disabled:cursor-not-allowed
              ${isCameraOn
                ? 'border-red-800/60 bg-red-950/60 text-red-300 hover:bg-red-900/40'
                : 'border-neutral-600 bg-neutral-800/60 text-neutral-200 hover:bg-neutral-700/60'
              }`}
          >
            {isCameraOn ? (
              <><CameraOff className="w-3.5 h-3.5" /> Stop</>
            ) : (
              <><Camera className="w-3.5 h-3.5" /> Start</>
            )}
          </button>

          <button
            onClick={onInferenceToggle}
            disabled={!isCameraOn || !isModelLoaded}
            className={`flex items-center justify-center gap-1.5 px-3 py-2.5 sm:py-2 text-xs border transition-colors disabled:opacity-30 disabled:cursor-not-allowed
              ${isRunning
                ? 'border-amber-800/60 bg-amber-950/60 text-amber-300 hover:bg-amber-900/40'
                : 'border-emerald-800/60 bg-emerald-950/60 text-emerald-300 hover:bg-emerald-900/40'
              }`}
          >
            {isRunning ? (
              <><Square className="w-3 h-3" /> Stop</>
            ) : (
              <><Play className="w-3.5 h-3.5" /> Detect</>
            )}
          </button>
        </div>

        {/* Compare Models Button */}
        {models.length >= 2 && (
          <button
            onClick={onCompareOpen}
            className="w-full flex items-center justify-center gap-1.5 px-3 py-2 text-xs border border-neutral-700/50 bg-neutral-800/40 text-neutral-400 hover:text-neutral-200 hover:bg-neutral-700/40 transition-colors"
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            Compare Models
          </button>
        )}
      </div>
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-[var(--text-muted)] text-[10px] tracking-wider uppercase">
        {label}
      </label>
      {children}
    </div>
  );
}