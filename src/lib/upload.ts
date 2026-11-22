// Client-side upload checks. The backend re-validates everything (magic bytes, size); these only
// give fast, friendly feedback before a 50 MB file is sent over the wire.
export const ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx,.pptx";
export const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const EXTENSIONS = new Set(ACCEPT.split(","));

/** Returns a user-facing reason the file will be rejected, or null if it looks acceptable. */
export function validateUpload(file: { name: string; size: number }): string | null {
  const dot = file.name.lastIndexOf(".");
  const ext = dot >= 0 ? file.name.slice(dot).toLowerCase() : "";
  if (!EXTENSIONS.has(ext)) return "Unsupported file type. Use PDF, PNG, JPEG, DOCX, XLSX or PPTX.";
  if (file.size === 0) return "The file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return "File exceeds the 50 MB limit.";
  return null;
}
