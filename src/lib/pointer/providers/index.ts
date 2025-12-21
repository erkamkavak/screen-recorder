import type { PointerPackImportResult, PointerPackProvider } from "./types";
import { sweezyProvider } from "./sweezy";

const providers: PointerPackProvider[] = [sweezyProvider];

export const getPointerPackProvider = (id: string) =>
  providers.find((provider) => provider.id === id) ?? sweezyProvider;

export const importPointerPackFromProvider = async (
  providerId: string,
  file: File
): Promise<PointerPackImportResult> => {
  const provider = getPointerPackProvider(providerId);
  return provider.importFromZip(file);
};
