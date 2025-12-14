import { writable } from "svelte/store";
import type { TranscriptionJobSnapshot, TranscriptionResult } from "../backend/backendAPI";

export type TranscriptionSettings = {
  provider: string;
  apiKey: string;
  apiBaseUrl: string;
  showCaptions: boolean;
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
  };

  const store = writable<TranscriptionSettings>(initial);
  store.subscribe((value) => {
    try {
      localStorage.setItem("transcriptionSettings", JSON.stringify(value));
    } catch {}
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

export const transcriptionResult = writable<TranscriptionResult | null>(null);
