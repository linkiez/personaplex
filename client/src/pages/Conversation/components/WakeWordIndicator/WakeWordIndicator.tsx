import { FC, useMemo } from "react";
import { WakeWordState } from "../../hooks/useWakeWordState";

type WakeWordIndicatorProps = {
  wakeWordEnabled: boolean;
  wakeState: WakeWordState;
  silenceElapsedMs: number;
  onToggle: () => void;
};

export const WakeWordIndicator: FC<WakeWordIndicatorProps> = ({
  wakeWordEnabled,
  wakeState,
  silenceElapsedMs,
  onToggle,
}) => {
  const { label, dotClass } = useMemo(() => {
    if (!wakeWordEnabled) {
      return {
        label: "Modo contínuo",
        dotClass: "bg-slate-500",
      };
    }

    if (wakeState === "standby") {
      return {
        label: "Standby",
        dotClass: "bg-amber-400",
      };
    }

    if (wakeState === "listening") {
      return {
        label: "Ativando",
        dotClass: "bg-sky-400",
      };
    }

    return {
      label: "Conversando",
      dotClass: "bg-emerald-500",
    };
  }, [wakeWordEnabled, wakeState]);

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-300 px-3 py-2">
      <span className={`h-3 w-3 rounded-full ${dotClass}`} />
      <div className="flex flex-col leading-tight">
        <span className="text-sm font-medium text-slate-100">{label}</span>
        {wakeWordEnabled && wakeState === "conversing" && (
          <span className="text-[11px] text-slate-300">Silêncio: {Math.floor(silenceElapsedMs / 1000)}s</span>
        )}
      </div>
      <button
        type="button"
        onClick={onToggle}
        className="rounded-md border border-slate-500 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700"
      >
        {wakeWordEnabled ? "Desativar wake" : "Ativar wake"}
      </button>
    </div>
  );
};
