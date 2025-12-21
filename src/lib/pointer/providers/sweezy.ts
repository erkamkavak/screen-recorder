import type { PointerPackImportResult } from "./types";
import {
  arrayBufferToBase64,
  createPointerPackId,
  decompressZipEntry,
  getExtension,
  getMimeTypeForExtension,
  parseZipEntries,
  sanitizeIdSegment,
  supportedImageExtensions,
  type ZipEntry,
} from "../pointerPackZip";

export const sweezyProvider = {
  id: "sweezy",
  label: "Sweezy Cursors",
  importFromZip: async (file: File): Promise<PointerPackImportResult> => {
    try {
      const buffer = await file.arrayBuffer();
      const entries = parseZipEntries(buffer);
      if (!entries.length) {
        return { options: [], packs: [], message: "No supported pointer images were found inside this zip." };
      }

      type PackCandidate = {
        id: string;
        label: string;
        cursorEntry?: ZipEntry;
        pointerEntry?: ZipEntry;
      };

      const baseFileName = file.name.replace(/\.[^.]+$/, "");
      const packMap = new Map<string, PackCandidate>();

      const normalizeEntryName = (entryName: string) => entryName.split("/").pop() ?? entryName;

      const buildPackLabel = (name: string) => {
        const trimmed = name.replace(/\.[^.]+$/, "").replace(/--(cursor|pointer).*/i, "").trim();
        return trimmed || baseFileName;
      };

      for (const entry of entries) {
        if (entry.name.endsWith("/")) continue;
        const ext = getExtension(entry.name);
        if (!supportedImageExtensions.has(ext)) continue;

        const cleanedName = normalizeEntryName(entry.name);
        const label = buildPackLabel(cleanedName);
        const keyBase = sanitizeIdSegment(label) || sanitizeIdSegment(baseFileName) || "cursor-pack";
        const existing = packMap.get(keyBase);
        const pack: PackCandidate = existing ?? { id: keyBase, label };

        const normalized = cleanedName.toLowerCase();
        if (normalized.includes("pointer")) {
          pack.pointerEntry = pack.pointerEntry ?? entry;
        } else {
          pack.cursorEntry = pack.cursorEntry ?? entry;
        }
        packMap.set(keyBase, pack);
      }

      if (!packMap.size) {
        return { options: [], packs: [], message: "No supported pointer images were found inside this zip." };
      }

      const loadedOptions = [];
      const storedPacks = [];

      for (const pack of packMap.values()) {
        const cursorEntry = pack.cursorEntry ?? pack.pointerEntry;
        if (!cursorEntry) continue;
        const cursorMime = getMimeTypeForExtension(getExtension(cursorEntry.name));
        if (!cursorMime) continue;

        const cursorData = await decompressZipEntry(cursorEntry, buffer);
        const cursorBase64 = arrayBufferToBase64(cursorData);
        const cursorDataUrl = `data:${cursorMime};base64,${cursorBase64}`;

        let pressedDataUrl = cursorDataUrl;
        const pointerEntry = pack.pointerEntry;
        if (pointerEntry) {
          const pointerMime = getMimeTypeForExtension(getExtension(pointerEntry.name));
          if (pointerMime) {
            const pointerData = await decompressZipEntry(pointerEntry, buffer);
            const pointerBase64 = arrayBufferToBase64(pointerData);
            pressedDataUrl = `data:${pointerMime};base64,${pointerBase64}`;
          }
        }

        const optionId = createPointerPackId(`${pack.label}-${file.name}`);
        const option = {
          id: optionId,
          label: pack.label,
          data: `url("${cursorDataUrl}")`,
          pressedData: `url("${pressedDataUrl}")`,
        };

        loadedOptions.push(option);
        storedPacks.push({
          ...option,
          sourceId: "sweezy",
          addedAt: Date.now(),
        });
      }

      return {
        options: loadedOptions,
        packs: storedPacks,
        message:
          loadedOptions.length > 0
            ? `Imported ${loadedOptions.length} pack${loadedOptions.length === 1 ? "" : "s"} from ${file.name}.`
            : "No supported pointer images were found inside this zip.",
      };
    } catch (error) {
      console.error("Failed to import pointer pack", error);
      return { options: [], packs: [], message: "Unable to extract pointer images from this zip file." };
    }
  },
};
