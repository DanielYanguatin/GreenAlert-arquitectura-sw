/** Archivos mínimos con firmas binarias reales (generados en memoria, no son fotografías reales). */
export const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(200, 1)]);
export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 2)]);
export const WEBP = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBPVP8 '),
  Buffer.alloc(100, 3),
]);
/** Ejecutable de Windows (cabecera MZ) disfrazado de imagen. */
export const FAKE_EXE = Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 0x90)]);
export const SVG_XSS = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
