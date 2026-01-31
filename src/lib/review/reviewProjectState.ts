import type { RecordingSegment } from "../stores";
import type { TimelineSnapshot } from "../stores/timeline";
import type { TranscriptionVersion } from "../stores/transcription";
import type { CinematicEffectsConfig } from "../rendering/cinematicEffects";

export type PersistedReviewState = {
  timeline?: TimelineSnapshot;
  includePointerTrack?: boolean;
  includeWebcamTrack?: boolean;
  includeAudioTrack?: boolean;
  includeClickTrack?: boolean;
  pointerIndicatorSize?: number;
  pointerIconSelection?: string;
  renderFormat?: string;
  selectedResolutionPreset?: string;
  selectedFrameRatePreset?: string;
  showCaptions?: boolean;
  captionFontSize?: number;
  captionColor?: string;
  transcriptionVersions?: TranscriptionVersion[];
  activeTranscriptionId?: string | null;
  cinematicEffects?: CinematicEffectsConfig;
};

export const getSegmentsEffectiveDurationSec = (segments: RecordingSegment[] | null | undefined) => {
  if (!segments?.length) return 0;
  const ms = segments.reduce(
    (sum, seg) => sum + Math.max(0, seg.duration - seg.trimStart - seg.trimEnd),
    0
  );
  return Math.max(0, ms / 1000);
};

export const buildPersistedReviewState = (args: {
  timeline: TimelineSnapshot;
  includePointerTrack: boolean;
  includeWebcamTrack: boolean;
  includeAudioTrack: boolean;
  includeClickTrack: boolean;
  pointerIndicatorSize: number;
  pointerIconSelection: string;
  renderFormat: string;
  selectedResolutionPreset: string;
  selectedFrameRatePreset: string;
  showCaptions: boolean;
  captionFontSize: number;
  captionColor: string;
  transcriptionVersions: TranscriptionVersion[];
  activeTranscriptionId: string | null;
  cinematicEffects: CinematicEffectsConfig;
}): PersistedReviewState => ({
  timeline: args.timeline,
  includePointerTrack: args.includePointerTrack,
  includeWebcamTrack: args.includeWebcamTrack,
  includeAudioTrack: args.includeAudioTrack,
  includeClickTrack: args.includeClickTrack,
  pointerIndicatorSize: args.pointerIndicatorSize,
  pointerIconSelection: args.pointerIconSelection,
  renderFormat: args.renderFormat,
  selectedResolutionPreset: args.selectedResolutionPreset,
  selectedFrameRatePreset: args.selectedFrameRatePreset,
  showCaptions: args.showCaptions,
  captionFontSize: args.captionFontSize,
  captionColor: args.captionColor,
  transcriptionVersions: args.transcriptionVersions,
  activeTranscriptionId: args.activeTranscriptionId,
  cinematicEffects: args.cinematicEffects,
});

export const buildPersistedReviewStateForContinuation = (args: {
  timeline: TimelineSnapshot;
} & Omit<Parameters<typeof buildPersistedReviewState>[0], "timeline">): PersistedReviewState => ({
  ...buildPersistedReviewState(args),
  timeline: { ...args.timeline },
});

export const applyPersistedReviewState = (args: {
  state: PersistedReviewState;
  clamp: (value: number, min: number, max: number) => number;
  timeline: {
    loadSnapshot: (snapshot: TimelineSnapshot) => void;
  };
  setIncludePointerTrack: (v: boolean) => void;
  setIncludeWebcamTrack: (v: boolean) => void;
  setIncludeAudioTrack: (v: boolean) => void;
  setIncludeClickTrack: (v: boolean) => void;
  setPointerIndicatorSize: (v: number) => void;
  setPointerIconSelection: (v: string) => void;
  setRenderFormat: (v: string) => void;
  setSelectedResolutionPreset: (v: string) => void;
  setSelectedFrameRatePreset: (v: string) => void;
  setShowCaptions: (v: boolean) => void;
  setCaptionFontSize: (v: number) => void;
  setCaptionColor: (v: string) => void;
  setTranscriptionVersions: (v: TranscriptionVersion[]) => void;
  setActiveTranscriptionId: (v: string | null) => void;
  setCinematicEffects: (v: CinematicEffectsConfig) => void;
}): void => {
  const { state } = args;

  if (state?.timeline) {
    args.timeline.loadSnapshot(state.timeline);
  }

  if (typeof state?.includePointerTrack === "boolean") args.setIncludePointerTrack(state.includePointerTrack);
  if (typeof state?.includeWebcamTrack === "boolean") args.setIncludeWebcamTrack(state.includeWebcamTrack);
  if (typeof state?.includeAudioTrack === "boolean") args.setIncludeAudioTrack(state.includeAudioTrack);
  if (typeof state?.includeClickTrack === "boolean") args.setIncludeClickTrack(state.includeClickTrack);

  if (typeof state?.pointerIndicatorSize === "number") {
    args.setPointerIndicatorSize(args.clamp(state.pointerIndicatorSize, 6, 64));
  }
  if (typeof state?.pointerIconSelection === "string") {
    args.setPointerIconSelection(state.pointerIconSelection);
  }

  if (typeof state?.renderFormat === "string") {
    args.setRenderFormat(state.renderFormat);
  }
  if (typeof state?.selectedResolutionPreset === "string") {
    args.setSelectedResolutionPreset(state.selectedResolutionPreset);
  }
  if (typeof state?.selectedFrameRatePreset === "string") {
    args.setSelectedFrameRatePreset(state.selectedFrameRatePreset);
  }

  if (typeof state?.showCaptions === "boolean") {
    args.setShowCaptions(state.showCaptions);
  }
  if (typeof state?.captionFontSize === "number") {
    args.setCaptionFontSize(state.captionFontSize);
  }
  if (typeof state?.captionColor === "string") {
    args.setCaptionColor(state.captionColor);
  }
  if (state?.transcriptionVersions) {
    args.setTranscriptionVersions(state.transcriptionVersions);
  }
  if (state?.activeTranscriptionId !== undefined) {
    args.setActiveTranscriptionId(state.activeTranscriptionId);
  }
  if (state?.cinematicEffects) {
    args.setCinematicEffects(state.cinematicEffects);
  }
};
