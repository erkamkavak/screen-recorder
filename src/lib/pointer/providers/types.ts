import type { PointerIconOption } from "../../review/reviewTypes";
import type { StoredPointerPack } from "../pointerPackTypes";

export type PointerPackImportResult = {
  options: PointerIconOption[];
  packs: StoredPointerPack[];
  message: string;
};

export type PointerPackProvider = {
  id: string;
  label: string;
  importFromZip: (file: File) => Promise<PointerPackImportResult>;
};
