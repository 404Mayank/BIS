import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router';
import { LogOut, Shield } from 'lucide-react';
import { YoloControls } from './components/yolo-controls';
import { DetectionOutput } from './components/detection-output';
import { MetricsPanel } from './components/metrics-panel';
import { DetectionsList } from './components/detections-list';
import { LoadingOverlay } from './components/loading-overlay';
import { SessionTimer } from './components/session-timer';
import { ImageUploadPreview } from './components/image-upload-preview';
import { useCamera } from './hooks/use-camera';
import { useInference } from './hooks/use-inference';
import { UltralyticsInferenceService } from './services/ultralytics-inference';
import { getUser, isAdmin, logout, authFetch } from './services/auth-service';
import type { ModelInfo, CaptureResult } from './services/inference-service';

export default function App() {
  const navigate = useNavigate();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const inferenceService = useMemo(() => new UltralyticsInferenceService('ws://localhost:8000'), []);

  const [models, setModels] = useState<ModelInfo[]>([]);
  const [selectedModel, setSelectedModel] = useState<string>('');
  const [isModelLoading, setIsModelLoading] = useState<boolean>(false);
  const [isModelLoaded, setIsModelLoaded] = useState<boolean>(false);
  const [isRunning, setIsRunning] = useState(false);
  const [confidenceThreshold, setConfidenceThreshold] = useState(0.25);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [inputMode, setInputMode] = useState<'live' | 'upload'>('live');
  const [staticDetections, setStaticDetections] = useState<any[]>([]);

  const camera = useCamera();

  const { fps, inferenceTime, detections } = useInference({
    service: inferenceService,
    videoRef: camera.videoRef,
    canvasRef,
    confidenceThreshold,
    enabled: isRunning,
  });

  const toggleTheme = useCallback(() => {
    setTheme(prev => {
      const next = prev === 'dark' ? 'light' : 'dark';
      if (next === 'light') {
        document.documentElement.classList.add('theme-light');
      } else {
        document.documentElement.classList.remove('theme-light');
      }
      return next;
    });
  }, []);

  const user = getUser();
  const userIsAdmin = isAdmin();

  const handleLogout = useCallback(() => {
    logout();
    navigate('/login');
  }, [navigate]);

  const fetchModels = useCallback(async () => {
    try {
      const response = await authFetch('/api/models');
      const data = await response.json();
      setModels(data);
      if (data.length > 0 && !selectedModel) {
        setSelectedModel(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  }, [selectedModel]);

  useEffect(() => { fetchModels(); }, [fetchModels]);

  const handleModelChange = useCallback(async (modelId: string) => {
    setSelectedModel(modelId);
    setIsModelLoading(true);
    setIsModelLoaded(false);
    setIsRunning(false);
    try {
      await inferenceService.loadModel(modelId);
      setIsModelLoaded(true);
    } catch (err) {
      console.error('Failed to load model:', err);
    } finally {
      setIsModelLoading(false);
    }
  }, [inferenceService]);

  useEffect(() => {
    if (selectedModel && !isModelLoaded && !isModelLoading) {
      handleModelChange(selectedModel);
    }
  }, [selectedModel, isModelLoaded, isModelLoading, handleModelChange]);

  const handleCapture = useCallback(async (): Promise<CaptureResult | null> => {
    if (!camera.videoRef.current) return null;
    try {
      return await inferenceService.captureFrame(camera.videoRef.current, confidenceThreshold);
    } catch {
      return null;
    }
  }, [inferenceService, camera.videoRef, confidenceThreshold]);

  return (
    <>
      {isModelLoading && <LoadingOverlay modelName={selectedModel} />}

      {/* Full viewport HUD — no scrolling on desktop */}
      <div className="h-screen bg-[var(--bg-primary)] text-[var(--text-primary)] font-mono flex flex-col overflow-hidden p-2 sm:p-3">
        {/* Header */}
        <header className="flex items-center justify-between px-3 py-1.5 border border-[var(--border)] bg-[var(--bg-card)] mb-2 shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[var(--accent)]" />
            <h1 className="text-sm text-[var(--text-primary)] tracking-wider">
              BIS <span className="text-[var(--text-muted)] text-[10px] tracking-widest">BLISTER INSPECTION</span>
            </h1>
          </div>
          <div className="flex items-center gap-3">
            {user && (
              <div className="flex items-center gap-2">
                <span className="text-[var(--text-muted)] text-[10px] uppercase tracking-widest px-2 py-0.5 border border-[var(--border)] bg-[var(--bg-card-header)]">
                  {user.username}
                </span>
                <SessionTimer />
              </div>
            )}
            {userIsAdmin && (
              <button
                onClick={() => navigate('/admin')}
                className="p-1 text-amber-500/60 hover:text-amber-400 transition-colors"
                title="Admin Panel"
              >
                <Shield className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              onClick={handleLogout}
              className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
              title="Logout"
            >
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </header>

        {/* Metrics bar */}
        <div className="mb-2 shrink-0">
          <MetricsPanel
            fps={fps}
            inferenceTime={inferenceTime}
            isRunning={isRunning}
            detectionCount={detections.length}
          />
        </div>

        {/* Main: Camera (fills space) + Sidebar */}
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-2">
          {/* Main Content Area */}
          <div className="min-h-0 overflow-hidden">
            {inputMode === 'live' ? (
              <DetectionOutput
                canvasRef={canvasRef}
                videoRef={camera.videoRef}
                isRunning={isRunning}
                isCameraOn={camera.isOn}
                onCapture={isModelLoaded && camera.isOn ? handleCapture : undefined}
              />
            ) : (
              <ImageUploadPreview
                inferenceService={inferenceService}
                confidenceThreshold={confidenceThreshold}
                isModelLoaded={isModelLoaded}
                onDetectionsChange={setStaticDetections}
              />
            )}
          </div>

          {/* Sidebar */}
          <div className="flex flex-col gap-2 min-h-0 overflow-y-auto">
            <YoloControls
              models={models}
              selectedModel={selectedModel}
              onModelChange={handleModelChange}
              isModelLoaded={isModelLoaded}
              isCameraOn={camera.isOn}
              onCameraToggle={camera.toggle}
              isRunning={isRunning}
              onInferenceToggle={() => setIsRunning(prev => !prev)}
              confidenceThreshold={confidenceThreshold}
              onConfidenceChange={setConfidenceThreshold}
              cameras={camera.devices}
              activeCamera={camera.activeDeviceId}
              onCameraSwitch={camera.switchDevice}
              cameraError={camera.error}
              onModelUploaded={fetchModels}
              theme={theme}
              onThemeToggle={toggleTheme}
              onCompareOpen={() => navigate('/compare-models')}
              inputMode={inputMode}
              onInputModeChange={setInputMode}
            />
            <DetectionsList detections={inputMode === 'live' ? detections : staticDetections} />
          </div>
        </div>
      </div>
    </>
  );
}