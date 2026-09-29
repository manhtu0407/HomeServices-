// Location check for images sent to a vision model. Storage transforms (which re-encode and
// drop metadata) are unavailable on the Free plan, so the server reads the metadata itself and
// refuses any image that still says where it was taken. "incomplete" means the metadata did not
// end inside the bytes read, so the image cannot be shown to be clean.

export type VisionImageLocationScan = "clean" | "location" | "incomplete";

const GPS_IFD_TAG = 0x8825;
const XMP_LOCATION_PATTERN = /GPS(?:Latitude|Longitude|Altitude|Coordinates)/i;

export function scanVisionImageLocation(
  mimeType: string,
  bytes: Uint8Array,
): VisionImageLocationScan {
  if (mimeType === "image/jpeg") return scanJpeg(bytes);
  if (mimeType === "image/png") return scanPng(bytes);
  if (mimeType === "image/webp") return scanWebp(bytes);
  return "incomplete";
}

function scanJpeg(bytes: Uint8Array): VisionImageLocationScan {
  let offset = 2;
  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) return "incomplete";
    const marker = bytes[offset + 1];
    if (marker === 0xff) {
      offset += 1;
      continue;
    }
    // Metadata segments all precede the first scan.
    if (marker === 0xda) return "clean";
    if (marker === 0xd9) return "incomplete";
    const length = (bytes[offset + 2] << 8) | bytes[offset + 3];
    if (length < 2) return "incomplete";
    const end = offset + 2 + length;
    if (end > bytes.length) return "incomplete";
    if (marker === 0xe1) {
      const payload = bytes.subarray(offset + 4, end);
      if (startsWithAscii(payload, "Exif\0\0") && tiffHasGps(payload.subarray(6))) return "location";
      if (startsWithAscii(payload, "http://ns.adobe.com/xap/1.0/") && XMP_LOCATION_PATTERN.test(latin1(payload))) {
        return "location";
      }
    }
    offset = end;
  }
  return "incomplete";
}

function scanPng(bytes: Uint8Array): VisionImageLocationScan {
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = readUint32(bytes, offset, false);
    const type = latin1(bytes.subarray(offset + 4, offset + 8));
    if (type === "IDAT" || type === "IEND") return "clean";
    const end = offset + 12 + length;
    if (end > bytes.length) return "incomplete";
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "eXIf" && tiffHasGps(data)) return "location";
    if ((type === "iTXt" || type === "tEXt" || type === "zTXt") && XMP_LOCATION_PATTERN.test(latin1(data))) {
      return "location";
    }
    offset = end;
  }
  return "incomplete";
}

function scanWebp(bytes: Uint8Array): VisionImageLocationScan {
  if (bytes.length < 16) return "incomplete";
  const chunk = latin1(bytes.subarray(12, 16));
  if (chunk === "VP8 " || chunk === "VP8L") return "clean";
  // An extended WebP stores EXIF and XMP after the image data; its header flags say whether they exist.
  if (chunk === "VP8X" && bytes.length >= 21) return (bytes[20] & 0x0c) === 0 ? "clean" : "location";
  return "incomplete";
}

function tiffHasGps(tiff: Uint8Array) {
  if (tiff.length < 8) return true;
  const order = latin1(tiff.subarray(0, 2));
  if (order !== "II" && order !== "MM") return true;
  const littleEndian = order === "II";
  const ifdOffset = readUint32(tiff, 4, littleEndian);
  if (ifdOffset + 2 > tiff.length) return true;
  const entries = readUint16(tiff, ifdOffset, littleEndian);
  for (let index = 0; index < entries; index += 1) {
    const entry = ifdOffset + 2 + index * 12;
    // An unreadable directory cannot be shown to lack a location.
    if (entry + 12 > tiff.length) return true;
    if (readUint16(tiff, entry, littleEndian) === GPS_IFD_TAG) return true;
  }
  return false;
}

function readUint16(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  return littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8)
    : (bytes[offset] << 8) | bytes[offset + 1];
}

function readUint32(bytes: Uint8Array, offset: number, littleEndian: boolean) {
  const value = littleEndian
    ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    : (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];
  return value >>> 0;
}

function startsWithAscii(bytes: Uint8Array, prefix: string) {
  if (bytes.length < prefix.length) return false;
  for (let index = 0; index < prefix.length; index += 1) {
    if (bytes[index] !== prefix.charCodeAt(index)) return false;
  }
  return true;
}

function latin1(bytes: Uint8Array) {
  let text = "";
  for (const byte of bytes) text += String.fromCharCode(byte);
  return text;
}
