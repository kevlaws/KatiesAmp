import type {
    ReplayGainAdjustment,
    ReplayGainMode,
} from '/@/renderer/features/player/audio-player/utils/volume-leveling';

import { createWithEqualityFn } from 'zustand/traditional';

export type MpvLoudnessTelemetry = {
    adjustment: ReplayGainAdjustment;
    audioFilters: string;
    configuredAt: number;
    replayGainMode: ReplayGainMode;
    songId: string;
    songUniqueId?: string;
};

type LoudnessTelemetryState = {
    clearMpvTelemetry: () => void;
    mpv: MpvLoudnessTelemetry | null;
    setMpvTelemetry: (telemetry: MpvLoudnessTelemetry) => void;
};

export const useLoudnessTelemetryStore = createWithEqualityFn<LoudnessTelemetryState>((set) => ({
    clearMpvTelemetry: () => set({ mpv: null }),
    mpv: null,
    setMpvTelemetry: (mpv) => set({ mpv }),
}));

export const clearMpvLoudnessTelemetry = () =>
    useLoudnessTelemetryStore.getState().clearMpvTelemetry();

export const setMpvLoudnessTelemetry = (telemetry: MpvLoudnessTelemetry) =>
    useLoudnessTelemetryStore.getState().setMpvTelemetry(telemetry);

export const useMpvLoudnessTelemetry = () => useLoudnessTelemetryStore((state) => state.mpv);
