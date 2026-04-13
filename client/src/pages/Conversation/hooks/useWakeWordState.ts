import { useCallback, useEffect, useRef, useState } from "react";
import { SocketStatus } from "../../../protocol/types";
import { useSilenceDetector } from "./useSilenceDetector";

export type WakeWordState = "standby" | "listening" | "conversing";

type UseWakeWordStateArgs = {
  socketStatus: SocketStatus;
  onRequireConnect: () => void;
  onRequireDisconnect: () => void;
  silenceTimeoutMs?: number;
};

export const useWakeWordState = ({
  socketStatus,
  onRequireConnect,
  onRequireDisconnect,
  silenceTimeoutMs = 12000,
}: UseWakeWordStateArgs) => {
  const [wakeState, setWakeState] = useState<WakeWordState>("standby");
  const [wakeWordEnabled, setWakeWordEnabled] = useState(true);
  const connectRequestedRef = useRef(false);

  const { elapsedMs, markActivity, reset } = useSilenceDetector({
    enabled: wakeWordEnabled && wakeState === "conversing",
    timeoutMs: silenceTimeoutMs,
    onTimeout: () => {
      setWakeState("standby");
      if (socketStatus === "connected") {
        onRequireDisconnect();
      }
    },
  });

  const onWakeWordDetected = useCallback(() => {
    if (!wakeWordEnabled || wakeState !== "standby") {
      return;
    }
    setWakeState("listening");
  }, [wakeWordEnabled, wakeState]);

  const onAudioActivity = useCallback(() => {
    if (wakeWordEnabled && wakeState === "conversing") {
      markActivity();
    }
  }, [wakeWordEnabled, wakeState, markActivity]);

  useEffect(() => {
    if (!wakeWordEnabled) {
      connectRequestedRef.current = false;
      if (socketStatus === "disconnected") {
        onRequireConnect();
      }
      setWakeState("conversing");
      reset();
      return;
    }

    if (wakeState === "listening" && socketStatus === "disconnected") {
      if (!connectRequestedRef.current) {
        connectRequestedRef.current = true;
        onRequireConnect();
      }
    }

    if (wakeState === "listening" && socketStatus === "connected") {
      connectRequestedRef.current = false;
      reset();
      markActivity();
      setWakeState("conversing");
    }

    if (wakeState === "conversing" && socketStatus === "disconnected") {
      connectRequestedRef.current = false;
      setWakeState("standby");
    }
  }, [wakeWordEnabled, wakeState, socketStatus, onRequireConnect, reset, markActivity]);

  const toggleWakeWord = useCallback(() => {
    setWakeWordEnabled(prev => {
      const next = !prev;
      if (next) {
        connectRequestedRef.current = false;
        setWakeState("standby");
        if (socketStatus === "connected") {
          onRequireDisconnect();
        }
      } else {
        reset();
        markActivity();
        setWakeState("conversing");
      }
      return next;
    });
  }, [socketStatus, onRequireDisconnect, reset, markActivity]);

  return {
    wakeState,
    wakeWordEnabled,
    silenceElapsedMs: elapsedMs,
    toggleWakeWord,
    onWakeWordDetected,
    onAudioActivity,
  };
};
