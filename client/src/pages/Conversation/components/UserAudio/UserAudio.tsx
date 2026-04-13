import { FC, useCallback, useEffect, useRef, useState } from "react";
import { useSocketContext } from "../../SocketContext";
import { useUserAudio } from "../../hooks/useUserAudio";
import { ClientVisualizer } from "../AudioVisualizer/ClientVisualizer";
import { type ThemeType } from "../../hooks/useSystemTheme";
import { WakeWordState } from "../../hooks/useWakeWordState";
import { useWakeWordDetector } from "../../hooks/useWakeWordDetector";

type UserAudioProps = {
  theme: ThemeType;
  wakeWordEnabled: boolean;
  wakeWordState: WakeWordState;
  onWakeWordDetected: () => void;
  onAudioActivity: () => void;
};
export const UserAudio: FC<UserAudioProps> = ({
  theme,
  wakeWordEnabled,
  wakeWordState,
  onWakeWordDetected,
  onAudioActivity,
}) => {
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);
  const { sendMessage, socketStatus } = useSocketContext();
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);
  const { isVoiceActive } = useWakeWordDetector({
    analyser,
    enabled: wakeWordEnabled && wakeWordState === "standby",
    threshold: 0.02,
    onDetected: onWakeWordDetected,
  });
  const onRecordingStart = useCallback(() => {
    console.log("Recording started");
  }, []);

  const onRecordingStop = useCallback(() => {
    console.log("Recording stopped");
  }, []);

  const onRecordingChunk = useCallback(
    (chunk: Uint8Array) => {
      if (wakeWordEnabled && wakeWordState !== "conversing") {
        return;
      }
      if (socketStatus !== "connected") {
        return;
      }
      sendMessage({
        type: "audio",
        data: chunk,
      });
    },
    [sendMessage, socketStatus, wakeWordEnabled, wakeWordState],
  );

  const { startRecordingUser, stopRecording } = useUserAudio({
    constraints: {
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
      video: false,
    },
    onDataChunk: onRecordingChunk,
    onRecordingStart,
    onRecordingStop,
  });

  useEffect(() => {
    if (startedRef.current) {
      return;
    }
    startedRef.current = true;
    let res: Awaited<ReturnType<typeof startRecordingUser>>;
    startRecordingUser().then(result => {
      if (result) {
        res = result;
        setAnalyser(result.analyser);
      }
    });
    return () => {
      console.log("Stop recording called from somewhere else.");
      stopRecording();
      res?.source?.disconnect();
      startedRef.current = false;
    };
  }, [startRecordingUser, stopRecording]);

  useEffect(() => {
    if (wakeWordState === "conversing" && isVoiceActive) {
      onAudioActivity();
    }
  }, [wakeWordState, isVoiceActive, onAudioActivity]);

  return (
    <div className="user-audio h-5/6 aspect-square" ref={containerRef}>
      <ClientVisualizer theme={theme} analyser={analyser} parent={containerRef}/>
    </div>
  );
};
