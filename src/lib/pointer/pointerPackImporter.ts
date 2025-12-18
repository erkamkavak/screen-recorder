import type { PointerIconOption } from "../review/reviewTypes";

export const supportedImageExtensions = new Set(["png", "svg", "webp", "jpg", "jpeg", "gif"]);

export const getExtension = (name: string) => {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/i);
  return match ? match[1] : "";
};

export const getMimeTypeForExtension = (ext: string) => {
  switch (ext) {
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "gif":
      return "image/gif";
    default:
      return null;
  }
};

export const arrayBufferToBase64 = (data: Uint8Array) => {
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < data.length; i += chunkSize) {
    const slice = data.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

export type ZipEntry = {
  name: string;
  compression: number;
  compressedSize: number;
  uncompressedSize: number;
  dataOffset: number;
};

const getDataOffsetForLocalHeader = (buffer: ArrayBuffer, localHeaderOffset: number) => {
  const view = new DataView(buffer);
  const total = buffer.byteLength;
  if (localHeaderOffset + 30 > total) return null;
  const signature = view.getUint32(localHeaderOffset, true);
  if (signature !== 0x04034b50) return null;
  const nameLen = view.getUint16(localHeaderOffset + 26, true);
  const extraLen = view.getUint16(localHeaderOffset + 28, true);
  const dataOffset = localHeaderOffset + 30 + nameLen + extraLen;
  if (dataOffset > total) return null;
  return dataOffset;
};

const findEndOfCentralDirectory = (buffer: ArrayBuffer) => {
  const view = new DataView(buffer);
  const total = buffer.byteLength;
  // EOCD record is at least 22 bytes; the comment field makes it variable-length.
  // Spec max comment length is 65535, so search the last 22+65535 bytes.
  const maxSearch = Math.min(total, 22 + 0xffff);
  for (let i = total - 22; i >= total - maxSearch; i--) {
    if (i < 0) break;
    const sig = view.getUint32(i, true);
    if (sig === 0x06054b50) return i;
  }
  return null;
};

export const parseZipEntries = (buffer: ArrayBuffer) => {
  const entries: ZipEntry[] = [];
  const view = new DataView(buffer);
  const decoder = new TextDecoder("utf-8");
  const total = buffer.byteLength;

  const eocdOffset = findEndOfCentralDirectory(buffer);
  if (eocdOffset != null) {
    const centralDirectorySize = view.getUint32(eocdOffset + 12, true);
    const centralDirectoryOffset = view.getUint32(eocdOffset + 16, true);
    let cursor = centralDirectoryOffset;
    const end = Math.min(total, centralDirectoryOffset + centralDirectorySize);

    while (cursor + 46 <= end) {
      const sig = view.getUint32(cursor, true);
      if (sig !== 0x02014b50) break;

      const compression = view.getUint16(cursor + 10, true);
      const compressedSize = view.getUint32(cursor + 20, true);
      const uncompressedSize = view.getUint32(cursor + 24, true);
      const nameLen = view.getUint16(cursor + 28, true);
      const extraLen = view.getUint16(cursor + 30, true);
      const commentLen = view.getUint16(cursor + 32, true);
      const localHeaderOffset = view.getUint32(cursor + 42, true);

      const nameStart = cursor + 46;
      const nameEnd = nameStart + nameLen;
      if (nameEnd > end) break;
      const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLen));

      const dataOffset = getDataOffsetForLocalHeader(buffer, localHeaderOffset);
      if (dataOffset != null && dataOffset + compressedSize <= total) {
        entries.push({
          name,
          compression,
          compressedSize,
          uncompressedSize,
          dataOffset,
        });
      }

      cursor = nameEnd + extraLen + commentLen;
    }

    return entries;
  }

  // Fallback: local file headers scan (less compatible; kept for very small/simple zips)
  let offset = 0;
  while (offset + 30 <= total) {
    const signature = view.getUint32(offset, true);
    if (signature !== 0x04034b50) break;
    const compression = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const nameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);
    const nameStart = offset + 30;
    if (nameStart + nameLen > total) break;
    const name = decoder.decode(new Uint8Array(buffer, nameStart, nameLen));
    const dataOffset = nameStart + nameLen + extraLen;
    if (dataOffset + compressedSize > total) break;

    entries.push({
      name,
      compression,
      compressedSize,
      uncompressedSize,
      dataOffset,
    });

    offset = dataOffset + compressedSize;
  }

  return entries;
};

export const decompressZipEntry = async (entry: ZipEntry, buffer: ArrayBuffer) => {
  if (entry.dataOffset + entry.compressedSize > buffer.byteLength) {
    throw new Error("ZIP entry appears truncated");
  }
  const compressedData = new Uint8Array(buffer, entry.dataOffset, entry.compressedSize);
  if (entry.compression === 0) {
    return compressedData;
  }
  if (entry.compression === 8) {
    const DSConstructor = (globalThis as any).DecompressionStream;
    if (!DSConstructor) {
      throw new Error("DecompressionStream is not supported in this environment");
    }
    const ds = new DSConstructor("deflate-raw");
    const writer = ds.writable.getWriter();
    writer.write(compressedData);
    writer.close();
    const reader = ds.readable.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        total += value.byteLength;
      }
    }
    const result = new Uint8Array(total);
    let cursor = 0;
    for (const chunk of chunks) {
      result.set(chunk, cursor);
      cursor += chunk.byteLength;
    }
    return result;
  }
  throw new Error(`Unsupported ZIP compression format: ${entry.compression}`);
};

export const sanitizeIdSegment = (value: string) =>
  value
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/(^-|-$)/g, "")
    .toLowerCase();

export const importPointerPackFromZip = async (
  file: File,
  existingZipCount: number
): Promise<{ options: PointerIconOption[]; message: string }> => {
  try {
    const buffer = await file.arrayBuffer();
    const entries = parseZipEntries(buffer);
    if (!entries.length) {
      return { options: [], message: "No supported pointer images were found inside this zip." };
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
      const keyBase = sanitizeIdSegment(label) || sanitizeIdSegment(baseFileName) || `cursor-pack`;
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
      return { options: [], message: "No supported pointer images were found inside this zip." };
    }

    const loadedOptions: PointerIconOption[] = [];
    let packIndex = 0;

    for (const pack of packMap.values()) {
      const cursorEntry = pack.cursorEntry ?? pack.pointerEntry;
      if (!cursorEntry) continue;
      const cursorMime = getMimeTypeForExtension(getExtension(cursorEntry.name));
      if (!cursorMime) continue;

      const cursorData = await decompressZipEntry(cursorEntry, buffer);
      const cursorBase64 = arrayBufferToBase64(cursorData);
      const cursorDataUrl = `data:${cursorMime};base64,${cursorBase64}`;

      let pressedDataUrl = cursorDataUrl;
      if (pack.pointerEntry) {
        const pointerMime = getMimeTypeForExtension(getExtension(pack.pointerEntry.name));
        if (pointerMime) {
          const pointerData = await decompressZipEntry(pack.pointerEntry, buffer);
          const pointerBase64 = arrayBufferToBase64(pointerData);
          pressedDataUrl = `data:${pointerMime};base64,${pointerBase64}`;
        }
      }

      const optionIdBase = sanitizeIdSegment(`${pack.label}-${file.name}`) || `cursor-pack-${packIndex}`;
      loadedOptions.push({
        id: `${optionIdBase}-${existingZipCount + packIndex}`,
        label: pack.label,
        data: `url("${cursorDataUrl}")`,
        pressedData: `url("${pressedDataUrl}")`,
      });
      packIndex += 1;
    }

    return {
      options: loadedOptions,
      message:
        loadedOptions.length > 0
          ? `Imported ${loadedOptions.length} pack${loadedOptions.length === 1 ? "" : "s"} from ${file.name}.`
          : "No supported pointer images were found inside this zip.",
    };
  } catch (error) {
    console.error("Failed to import pointer pack", error);
    return { options: [], message: "Unable to extract pointer images from this zip file." };
  }
};
