import { useState, useRef, useEffect } from 'react';
import { Upload, X, Loader2 } from 'lucide-react';
import type { CaptureResult, InferenceService } from '../services/inference-service';
import { CapturedCanvas } from './detection-output';

interface ImageUploadPreviewProps {
  inferenceService: InferenceService;
  confidenceThreshold: number;
  isModelLoaded: boolean;
  onDetectionsChange: (detections: any[]) => void;
}

export function ImageUploadPreview({ inferenceService, confidenceThreshold, isModelLoaded, onDetectionsChange }: ImageUploadPreviewProps) {
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [captureResult, setCaptureResult] = useState<CaptureResult | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // Clear previous
    setCaptureResult(null);
    onDetectionsChange([]);
    
    const url = URL.createObjectURL(file);
    setFileUrl(url);
  };

  const handleRunInference = async () => {
    if (!imgRef.current || !isModelLoaded) return;
    setIsProcessing(true);
    setCaptureResult(null);
    try {
      const result = await inferenceService.captureFrame(imgRef.current, confidenceThreshold);
      if (result) {
        setCaptureResult(result);
        onDetectionsChange(result.detections);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsProcessing(false);
    }
  };

  const clearImage = () => {
    setFileUrl(null);
    setCaptureResult(null);
    onDetectionsChange([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Auto-run inference when image finishes loading
  const handleImageLoaded = () => {
    if (isModelLoaded && imgRef.current) {
      handleRunInference();
    }
  };

  // Re-run if confidence threshold changes and we have an image loaded
  useEffect(() => {
    if (fileUrl && imgRef.current && isModelLoaded && !isProcessing) {
      handleRunInference();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confidenceThreshold]);

  return (
    <div className="border border-neutral-700/50 bg-[var(--bg-card)] overflow-hidden flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-neutral-700/50 bg-[var(--bg-card-header)] shrink-0">
        <span className="text-[var(--accent-muted)] text-[10px] tracking-widest uppercase">
          Image Upload Mode
        </span>
        <div className="flex items-center gap-2">
          {fileUrl && (
            <button
              onClick={handleRunInference}
              disabled={isProcessing || !isModelLoaded}
              className="flex items-center gap-1 px-2 py-1 text-[10px] bg-cyan-900/40 hover:bg-cyan-800/50 border border-cyan-700/40 text-cyan-300 tracking-wider uppercase transition-colors disabled:opacity-50"
            >
              {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              Inspect Image
            </button>
          )}
          <div className="flex items-center gap-1.5">
            <div className={`w-1.5 h-1.5 rounded-full ${!fileUrl ? 'bg-[var(--text-muted)]' : isProcessing ? 'bg-amber-500 animate-pulse' : 'bg-emerald-400'}`} />
            <span className={`text-[10px] tracking-wider uppercase ${!fileUrl ? 'text-[var(--text-muted)]' : isProcessing ? 'text-amber-400' : 'text-emerald-400'}`}>
              {!fileUrl ? 'WAITING' : isProcessing ? 'PROCESSING' : 'READY'}
            </span>
          </div>
        </div>
      </div>

      <div className="relative bg-neutral-950 flex-1 min-h-0 flex items-center justify-center">
        {!fileUrl ? (
          <div className="text-center space-y-4 w-full h-full flex flex-col items-center justify-center cursor-pointer border-2 border-dashed border-neutral-800 hover:bg-neutral-900/50 transition-colors m-4 rounded-xl" onClick={() => fileInputRef.current?.click()}>
            <Upload className="w-10 h-10 mx-auto text-neutral-600" />
            <div>
              <p className="text-neutral-300 text-sm font-medium">Click to upload image</p>
              <p className="text-neutral-500 text-xs mt-1">Supports JPG, PNG, WEBP</p>
            </div>
          </div>
        ) : (
          <div className="relative w-full h-full">
            <img 
              ref={imgRef}
              src={fileUrl} 
              alt="Uploaded" 
              className="absolute inset-0 w-full h-full object-contain"
              style={{ opacity: captureResult ? 0 : 1 }}
              onLoad={handleImageLoaded}
            />
            {captureResult && (
              <div className="absolute inset-0 bg-neutral-950">
                <CapturedCanvas result={captureResult} />
              </div>
            )}
            <button 
              onClick={clearImage}
              className="absolute top-2 right-2 p-1.5 bg-neutral-900/80 hover:bg-red-900/80 border border-neutral-700/50 text-neutral-300 hover:text-white rounded transition-colors z-20"
              title="Clear Image"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          ref={fileInputRef}
          onChange={handleFileChange}
        />
      </div>
    </div>
  );
}
