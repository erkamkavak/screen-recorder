import type { StoredPointerPack } from "./pointerPackTypes";

const STORAGE_KEY = "pointerPackLibrary";

const isStoredPointerPack = (value: any): value is StoredPointerPack =>
  value &&
  typeof value === "object" &&
  typeof value.id === "string" &&
  typeof value.label === "string" &&
  typeof value.data === "string" &&
  typeof value.sourceId === "string" &&
  typeof value.addedAt === "number";

export const loadStoredPointerPacks = (): StoredPointerPack[] => {
  if (typeof localStorage === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isStoredPointerPack);
  } catch {
    return [];
  }
};

export const saveStoredPointerPacks = (packs: StoredPointerPack[]) => {
  if (typeof localStorage === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(packs));
};

export const addStoredPointerPacks = (packs: StoredPointerPack[]) => {
  const existing = loadStoredPointerPacks();
  const next = [...existing, ...packs];
  saveStoredPointerPacks(next);
  return next;
};

export const removeStoredPointerPack = (id: string) => {
  const existing = loadStoredPointerPacks();
  const next = existing.filter((pack) => pack.id !== id);
  saveStoredPointerPacks(next);
  return next;
};
