import { writable, derived } from "svelte/store";
import type { TranscriptionJobSnapshot, TranscriptionResult } from "../backend/backendAPI";

export interface TranscriptionVersion {
  id: string;
  provider: string;
  model: string;
  result: TranscriptionResult;
  timestamp: number;
}

export type TranscriptionSettings = {
  provider: string;
  apiKey: string;
  apiBaseUrl: string;
  showCaptions: boolean;
  selectedModel: string;
};

const createTranscriptionSettingsStore = () => {
  const stored = (() => {
    try {
      return JSON.parse(localStorage.getItem("transcriptionSettings") ?? "null") as Partial<TranscriptionSettings> | null;
    } catch {
      return null;
    }
  })();

  const initial: TranscriptionSettings = {
    provider: stored?.provider ?? "soniox",
    apiKey: stored?.apiKey ?? "",
    apiBaseUrl: stored?.apiBaseUrl ?? "https://api.soniox.com",
    showCaptions: stored?.showCaptions ?? true,
    selectedModel: stored?.selectedModel ?? "",
  };

  const store = writable<TranscriptionSettings>(initial);
  store.subscribe((value) => {
    try {
      localStorage.setItem("transcriptionSettings", JSON.stringify(value));
    } catch { }
  });
  return store;
};

export const transcriptionSettings = createTranscriptionSettingsStore();

export const transcriptionJob = writable<{
  jobId: string | null;
  status: TranscriptionJobSnapshot | null;
  running: boolean;
  error: string | null;
}>({ jobId: null, status: null, running: false, error: null });

export const transcriptionVersions = writable<TranscriptionVersion[]>([]);
export const activeTranscriptionId = writable<string | null>(null);

export const transcriptionResult = derived(
  [transcriptionVersions, activeTranscriptionId],
  ([$versions, $id]) => {
    if (!$id) return $versions.length > 0 ? $versions[$versions.length - 1].result : null;
    return $versions.find(v => v.id === $id)?.result ?? null;
  }
);
