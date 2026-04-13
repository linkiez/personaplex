import { useCallback, useEffect, useRef, useState } from "react";

type UseSilenceDetectorArgs = {
  enabled: boolean;
  timeoutMs: number;
  onTimeout: () => void;
};

export const useSilenceDetector = ({
  enabled,
  timeoutMs,
  onTimeout,
}: UseSilenceDetectorArgs) => {
  const [elapsedMs, setElapsedMs] = useState(0);
  const lastActivityRef = useRef<number>(Date.now());
  const timeoutTriggeredRef = useRef(false);

  const markActivity = useCallback(() => {
    lastActivityRef.current = Date.now();
    timeoutTriggeredRef.current = false;
  }, []);

  const reset = useCallback(() => {
    lastActivityRef.current = Date.now();
    timeoutTriggeredRef.current = false;
    setElapsedMs(0);
  }, []);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const intervalId = globalThis.setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= timeoutMs && !timeoutTriggeredRef.current) {
        timeoutTriggeredRef.current = true;
        onTimeout();
      }
    }, 250);

    return () => {
      globalThis.clearInterval(intervalId);
    };
  }, [enabled, timeoutMs, onTimeout]);

  return {
    elapsedMs,
    markActivity,
    reset,
  };
};
