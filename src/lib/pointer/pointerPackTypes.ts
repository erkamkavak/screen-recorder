import type { PointerIconOption } from "../review/reviewTypes";

export type StoredPointerPack = PointerIconOption & {
  sourceId: string;
  addedAt: number;
};
