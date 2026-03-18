import { useState, useEffect } from 'react';
import { getSessionExpiry, logout } from '../services/auth-service';
import { Clock } from 'lucide-react';
import { useNavigate } from 'react-router';

export function SessionTimer() {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const navigate = useNavigate();

  useEffect(() => {
    const expiry = getSessionExpiry();
    if (!expiry) return;

    const updateTimer = () => {
      const now = Date.now();
      const diff = expiry - now;
      if (diff <= 0) {
        logout();
        navigate('/login');
      } else {
        const min = Math.floor(diff / 60000);
        const sec = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${min}:${sec.toString().padStart(2, '0')}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [navigate]);

  if (!timeLeft) return null;

  return (
    <div className="flex items-center gap-1.5 text-amber-500/80 px-2 py-0.5 border border-amber-900/30 bg-amber-950/20" title="Session Time Remaining">
      <Clock className="w-3 h-3" />
      <span className="text-[10px] tracking-wider">{timeLeft}</span>
    </div>
  );
}
