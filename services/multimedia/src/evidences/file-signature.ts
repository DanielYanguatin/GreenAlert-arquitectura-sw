/**
 * Detección del tipo REAL de archivo por su firma binaria ("magic numbers").
 * No se confía en la extensión ni en el Content-Type enviado por el cliente.
 */
export interface DetectedType {
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  extension: 'jpg' | 'png' | 'webp';
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

export function detectImageType(buf: Buffer): DetectedType | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return { mimeType: 'image/jpeg', extension: 'jpg' };
  if (startsWith(buf, PNG)) return { mimeType: 'image/png', extension: 'png' };
  // RIFF....WEBP
  if (startsWith(buf, [0x52, 0x49, 0x46, 0x46]) && startsWith(buf, [0x57, 0x45, 0x42, 0x50], 8)) {
    return { mimeType: 'image/webp', extension: 'webp' };
  }
  return null;
}

/** Limpia el nombre original: solo se conserva como metadato, nunca se usa como ruta. */
export function sanitizeOriginalName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'archivo';
  // eslint-disable-next-line no-control-regex -- se eliminan explícitamente caracteres de control
  const cleaned = base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').trim();
  return (cleaned || 'archivo').slice(0, 150);
}
