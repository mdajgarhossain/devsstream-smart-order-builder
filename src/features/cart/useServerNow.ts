import { useEffect, useState } from 'react';
import { serverNow } from '../../api/serverTime';

/** Server time (ms), re-read every `intervalMs`. Countdowns use this, never Date.now() alone. */
export function useServerNow(intervalMs = 500): number {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(serverNow()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

/** "4:07" for the time left until `expiresAt`; "0:00" once it has passed. */
export function formatCountdown(msLeft: number): string {
  const total = Math.max(0, Math.ceil(msLeft / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}
