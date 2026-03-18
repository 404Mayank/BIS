import { RefObject, useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface WebcamPreviewProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  isCameraOn: boolean;
}

export function WebcamPreview({ videoRef, isCameraOn }: WebcamPreviewProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border border-neutral-700/50 bg-neutral-900/80 overflow-hidden">
      <button
        onClick={() => setCollapsed(!collapsed)}
        className="w-full flex items-center justify-between px-3 py-2 border-b border-neutral-700/50 bg-neutral-800/40 hover:bg-neutral-700/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className={`w-1.5 h-1.5 rounded-full ${isCameraOn ? 'bg-emerald-400' : 'bg-neutral-600'}`} />
          <span className="text-cyan-400/70 text-[10px] tracking-widest uppercase">
            Camera Raw
          </span>
        </div>
        {collapsed ? (
          <ChevronDown className="w-3.5 h-3.5 text-neutral-500" />
        ) : (
          <ChevronUp className="w-3.5 h-3.5 text-neutral-500" />
        )}
      </button>

      {!collapsed && (
        <div className="relative bg-neutral-950 aspect-video">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-contain"
          />
          {!isCameraOn && (
            <div className="absolute inset-0 flex items-center justify-center bg-neutral-950">
              <div className="text-center space-y-2">
                <div className="w-10 h-10 mx-auto border border-neutral-700/60 flex items-center justify-center">
                  <div className="w-3 h-3 rounded-full border border-neutral-600/60" />
                </div>
                <p className="text-neutral-500 text-xs">Camera offline</p>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}