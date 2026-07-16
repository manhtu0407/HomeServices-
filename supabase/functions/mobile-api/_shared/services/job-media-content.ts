import type { JobMediaAttachInput } from "../../../_shared/domain.ts";
export { MAX_JOB_MEDIA_BYTES } from "../../../_shared/job-media-contract.ts";

export type TrustedJobMediaMime =
  | "image/jpeg"
  | "image/png"
  | "image/webp"
  | "video/mp4";

export type JobMediaContentInspection =
  | { kind: "audio"; mimeType: null }
  | { kind: "trusted"; mimeType: TrustedJobMediaMime }
  | { kind: "unsupported"; mimeType: null };

export function inspectJobMediaContent(bytes: Uint8Array): JobMediaContentInspection {
  if (hasAudioSignature(bytes)) return { kind: "audio", mimeType: null };
  if (hasJpegSignature(bytes)) return { kind: "trusted", mimeType: "image/jpeg" };
  if (hasPngSignature(bytes)) return { kind: "trusted", mimeType: "image/png" };
  if (hasWebpSignature(bytes)) return { kind: "trusted", mimeType: "image/webp" };
  const mp4 = inspectIsoMediaHandlers(bytes);
  if (mp4.hasFtyp && mp4.hasVideo) {
    return { kind: "trusted", mimeType: "video/mp4" };
  }
  if (mp4.hasFtyp && mp4.hasAudio) return { kind: "audio", mimeType: null };
  return { kind: "unsupported", mimeType: null };
}

export async function inspectJobMediaBlob(blob: Blob): Promise<JobMediaContentInspection> {
  const prefix = await readBlobSlice(blob, 0, Math.min(blob.size, 16));
  if (hasAudioSignature(prefix)) return { kind: "audio", mimeType: null };
  if (hasJpegSignature(prefix)) return { kind: "trusted", mimeType: "image/jpeg" };
  if (hasPngSignature(prefix)) return { kind: "trusted", mimeType: "image/png" };
  if (
    prefix.length >= 12 &&
    ascii(prefix, 0, 4) === "RIFF" &&
    ascii(prefix, 8, 12) === "WEBP" &&
    readUint32LittleEndian(prefix, 4) === blob.size - 8
  ) {
    return { kind: "trusted", mimeType: "image/webp" };
  }

  const state = {
    boxesRemaining: 4096,
    hasAudio: false,
    hasFtyp: false,
    hasVideo: false,
    valid: true,
  };
  await scanIsoBlobBoxes(blob, 0, blob.size, 0, false, state);
  if (!state.valid || !state.hasFtyp) return { kind: "unsupported", mimeType: null };
  if (state.hasVideo) return { kind: "trusted", mimeType: "video/mp4" };
  if (state.hasAudio) return { kind: "audio", mimeType: null };
  return { kind: "unsupported", mimeType: null };
}

export function normalizeDeclaredJobMediaMime(value: string | null | undefined) {
  const normalized = value?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (normalized === "image/jpg" || normalized === "image/pjpeg") return "image/jpeg";
  return normalized || null;
}

export function jobMediaStageAllowsVideo(
  stage: JobMediaAttachInput["assets"][number]["stage"],
) {
  return stage === "before" || stage === "kael_reference";
}

function hasJpegSignature(bytes: Uint8Array) {
  return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
}

function hasPngSignature(bytes: Uint8Array) {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return bytes.length >= signature.length && signature.every((value, index) => bytes[index] === value);
}

function hasWebpSignature(bytes: Uint8Array) {
  return bytes.length >= 12 &&
    ascii(bytes, 0, 4) === "RIFF" &&
    ascii(bytes, 8, 12) === "WEBP" &&
    readUint32LittleEndian(bytes, 4) === bytes.length - 8;
}

function hasAudioSignature(bytes: Uint8Array) {
  if (ascii(bytes, 0, 3) === "ID3") return true;
  if (ascii(bytes, 0, 4) === "fLaC") return true;
  if (ascii(bytes, 0, 4) === "OggS") return true;
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WAVE") return true;
  return bytes.length >= 2 && bytes[0] === 0xff &&
    ((bytes[1] & 0xfe) === 0xfa || (bytes[1] & 0xf6) === 0xf0);
}

function ascii(bytes: Uint8Array, start: number, end: number) {
  if (bytes.length < end) return "";
  return String.fromCharCode(...bytes.slice(start, end));
}

function inspectIsoMediaHandlers(bytes: Uint8Array) {
  const state = { hasAudio: false, hasFtyp: false, hasVideo: false, valid: true };
  scanIsoBoxes(bytes, 0, bytes.length, 0, false, state);
  if (!state.valid) return { hasAudio: false, hasFtyp: false, hasVideo: false };
  return state;
}

async function scanIsoBlobBoxes(
  blob: Blob,
  start: number,
  end: number,
  depth: number,
  insideMedia: boolean,
  state: {
    boxesRemaining: number;
    hasAudio: boolean;
    hasFtyp: boolean;
    hasVideo: boolean;
    valid: boolean;
  },
) {
  if (!state.valid || depth > 4) {
    state.valid = false;
    return;
  }
  let offset = start;
  while (offset < end) {
    state.boxesRemaining -= 1;
    if (state.boxesRemaining < 0 || end - offset < 8) {
      state.valid = false;
      return;
    }
    const header = await readBlobSlice(blob, offset, Math.min(offset + 16, end));
    if (header.length < 8) {
      state.valid = false;
      return;
    }
    const size32 = readUint32BigEndian(header, 0);
    const type = ascii(header, 4, 8);
    let headerSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      if (header.length < 16 || readUint32BigEndian(header, 8) !== 0) {
        state.valid = false;
        return;
      }
      headerSize = 16;
      boxSize = readUint32BigEndian(header, 12);
    } else if (size32 === 0) {
      boxSize = end - offset;
    }
    if (boxSize < headerSize || offset + boxSize > end) {
      state.valid = false;
      return;
    }
    const payloadStart = offset + headerSize;
    const boxEnd = offset + boxSize;
    if (depth === 0 && type === "ftyp") state.hasFtyp = true;
    if (insideMedia && type === "hdlr" && payloadStart + 12 <= boxEnd) {
      const handlerBytes = await readBlobSlice(blob, payloadStart + 8, payloadStart + 12);
      const handler = ascii(handlerBytes, 0, 4);
      if (handler === "vide") state.hasVideo = true;
      if (handler === "soun") state.hasAudio = true;
    }
    if (type === "moov" || type === "trak" || type === "mdia") {
      await scanIsoBlobBoxes(
        blob,
        payloadStart,
        boxEnd,
        depth + 1,
        insideMedia || type === "mdia",
        state,
      );
    }
    offset = boxEnd;
  }
}

async function readBlobSlice(blob: Blob, start: number, end: number) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

function scanIsoBoxes(
  bytes: Uint8Array,
  start: number,
  end: number,
  depth: number,
  insideMedia: boolean,
  state: { hasAudio: boolean; hasFtyp: boolean; hasVideo: boolean; valid: boolean },
) {
  if (!state.valid || depth > 4) {
    state.valid = false;
    return;
  }
  let offset = start;
  while (offset < end) {
    if (end - offset < 8) {
      state.valid = false;
      return;
    }
    const size32 = readUint32BigEndian(bytes, offset);
    const type = ascii(bytes, offset + 4, offset + 8);
    let headerSize = 8;
    let boxSize = size32;
    if (size32 === 1) {
      if (end - offset < 16 || readUint32BigEndian(bytes, offset + 8) !== 0) {
        state.valid = false;
        return;
      }
      headerSize = 16;
      boxSize = readUint32BigEndian(bytes, offset + 12);
    } else if (size32 === 0) {
      boxSize = end - offset;
    }
    if (boxSize < headerSize || offset + boxSize > end) {
      state.valid = false;
      return;
    }
    const payloadStart = offset + headerSize;
    const boxEnd = offset + boxSize;
    if (depth === 0 && type === "ftyp") state.hasFtyp = true;
    if (insideMedia && type === "hdlr" && payloadStart + 12 <= boxEnd) {
      const handler = ascii(bytes, payloadStart + 8, payloadStart + 12);
      if (handler === "vide") state.hasVideo = true;
      if (handler === "soun") state.hasAudio = true;
    }
    if (type === "moov" || type === "trak" || type === "mdia") {
      scanIsoBoxes(
        bytes,
        payloadStart,
        boxEnd,
        depth + 1,
        insideMedia || type === "mdia",
        state,
      );
    }
    offset = boxEnd;
  }
}

function readUint32BigEndian(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 4) return -1;
  return bytes[offset] * 0x1000000 +
    bytes[offset + 1] * 0x10000 +
    bytes[offset + 2] * 0x100 +
    bytes[offset + 3];
}

function readUint32LittleEndian(bytes: Uint8Array, offset: number) {
  if (bytes.length < offset + 4) return -1;
  return bytes[offset] +
    bytes[offset + 1] * 0x100 +
    bytes[offset + 2] * 0x10000 +
    bytes[offset + 3] * 0x1000000;
}
