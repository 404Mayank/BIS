import { useState, useRef, useEffect, useCallback } from 'react';

export interface CameraDevice {
  deviceId: string;
  label: string;
  facingMode?: string; // 'user' | 'environment' for mobile
}

export function useCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const hasEnumerated = useRef(false);

  const [isOn, setIsOn] = useState(false);
  const [devices, setDevices] = useState<CameraDevice[]>([]);
  const [activeDeviceId, setActiveDeviceId] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [permissionState, setPermissionState] = useState<'prompt' | 'granted' | 'denied' | 'unknown'>('unknown');

  // Check permission state without triggering a prompt
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (navigator.permissions && navigator.permissions.query) {
          const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
          if (mounted) {
            setPermissionState(status.state as 'prompt' | 'granted' | 'denied');
            status.addEventListener('change', () => {
              if (mounted) setPermissionState(status.state as 'prompt' | 'granted' | 'denied');
            });
          }
        }
      } catch {
        // permissions.query('camera') not supported in all browsers — that's fine
        if (mounted) setPermissionState('unknown');
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Enumerate cameras — only requests getUserMedia if labels aren't available yet
  const enumerateDevices = useCallback(async (requestPermission = false) => {
    try {
      // First try enumerating without a stream (works if permission already granted)
      let allDevices = await navigator.mediaDevices.enumerateDevices();
      let videoDevices = allDevices.filter(d => d.kind === 'videoinput');

      // If labels are empty and we're allowed to request permission, get a temp stream
      const needsPermission = videoDevices.length === 0 || videoDevices.every(d => !d.label);
      if (needsPermission && requestPermission) {
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true });
        tempStream.getTracks().forEach(t => t.stop());
        allDevices = await navigator.mediaDevices.enumerateDevices();
        videoDevices = allDevices.filter(d => d.kind === 'videoinput');
        setPermissionState('granted');
      }

      const mapped = videoDevices.map((d, i) => ({
        deviceId: d.deviceId,
        label: d.label || `Camera ${i + 1}`,
        facingMode: d.label?.toLowerCase().includes('back') || d.label?.toLowerCase().includes('rear')
          ? 'environment'
          : d.label?.toLowerCase().includes('front') ? 'user' : undefined,
      }));

      setDevices(mapped);
      if (mapped.length > 0 && !activeDeviceId) {
        setActiveDeviceId(mapped[0].deviceId);
      }
      hasEnumerated.current = true;
      setError(null);
      return mapped;
    } catch (err: any) {
      console.warn('Camera enumeration failed:', err?.message);
      if (err?.name === 'NotAllowedError') {
        setPermissionState('denied');
        setError('Camera access denied. Check browser permissions.');
      } else {
        setError('No camera detected or access unavailable.');
      }
      return [];
    }
  }, [activeDeviceId]);

  // Silently enumerate on mount (no permission prompt) — picks up already-granted permissions
  useEffect(() => {
    enumerateDevices(false);
  }, [enumerateDevices]);

  // Start camera stream
  const start = useCallback(async (deviceId?: string) => {
    try {
      // Enumerate with permission request if we haven't yet
      let targetDevice = deviceId || activeDeviceId;
      if (!hasEnumerated.current || !targetDevice) {
        const enumerated = await enumerateDevices(true);
        if (enumerated.length === 0) {
          setError('No cameras found. Connect a camera and try again.');
          return;
        }
        targetDevice = deviceId || enumerated[0].deviceId;
      }

      // Stop any existing stream
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }

      const constraints: MediaStreamConstraints = {
        video: targetDevice
          ? { deviceId: { exact: targetDevice } }
          : { facingMode: 'environment' },
        audio: false,
      };

      const stream = await navigator.mediaDevices.getUserMedia(constraints);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        streamRef.current = stream;
        setIsOn(true);
        setActiveDeviceId(targetDevice);
        setError(null);
        setPermissionState('granted');
      }
    } catch (err: any) {
      console.error('Failed to start camera:', err?.message);
      if (err?.name === 'NotAllowedError') {
        setPermissionState('denied');
        setError('Camera access denied. Allow camera in your browser settings.');
      } else if (err?.name === 'NotFoundError' || err?.name === 'DevicesNotFoundError') {
        setError('No camera found. Connect a camera and try again.');
      } else if (err?.name === 'NotReadableError') {
        setError('Camera is in use by another application.');
      } else {
        setError('Could not access camera. Check permissions.');
      }
    }
  }, [activeDeviceId, enumerateDevices]);

  // Stop camera
  const stop = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsOn(false);
  }, []);

  // Toggle
  const toggle = useCallback(async () => {
    if (isOn) {
      stop();
    } else {
      await start();
    }
  }, [isOn, start, stop]);

  // Switch to a different camera
  const switchDevice = useCallback(async (deviceId: string) => {
    setActiveDeviceId(deviceId);
    if (isOn) {
      await start(deviceId);
    }
  }, [isOn, start]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  return {
    videoRef,
    isOn,
    devices,
    activeDeviceId,
    error,
    permissionState,
    toggle,
    switchDevice,
    start,
    stop,
  };
}