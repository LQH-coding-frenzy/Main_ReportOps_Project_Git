import { useEffect, useRef } from 'react';

/**
 * A custom hook that fires a callback at a regular interval.
 * 
 * @param callback The async function to call
 * @param intervalMs How often to poll in milliseconds
 * @param enabled Whether polling is active
 */
export function usePolling(
  callback: () => Promise<void>,
  intervalMs: number,
  enabled: boolean = true
) {
  const savedCallback = useRef(callback);

  // Remember the latest callback
  useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  // Set up the interval
  useEffect(() => {
    if (!enabled || intervalMs <= 0) return;

    const tick = () => {
      savedCallback.current().catch((err) => {
        console.error('Polling error:', err);
      });
    };

    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [intervalMs, enabled]);
}
