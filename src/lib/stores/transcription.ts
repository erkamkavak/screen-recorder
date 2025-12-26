import { writable } from "svelte/store";
import type { TranscriptionResult } from "../backend/backendAPI";

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
