import { FAKE_EXE, JPEG, PNG, SVG_XSS, WEBP } from '../../test/fixtures';
import { detectImageType, sanitizeOriginalName } from './file-signature';

describe('detectImageType', () => {
  it.each([
    ['JPEG', JPEG, 'image/jpeg'],
    ['PNG', PNG, 'image/png'],
    ['WEBP', WEBP, 'image/webp'],
  ])('reconoce %s por su firma', (_n: string, buf: Buffer, mime: string) => {
    expect(detectImageType(buf)?.mimeType).toBe(mime);
  });

  it.each([
    ['ejecutable disfrazado', FAKE_EXE],
    ['SVG con script', SVG_XSS],
    ['archivo vacío', Buffer.alloc(0)],
    ['RIFF que no es WEBP', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVE')])],
  ])('rechaza %s', (_n: string, buf: Buffer) => {
    expect(detectImageType(buf)).toBeNull();
  });
});

describe('sanitizeOriginalName', () => {
  it('elimina rutas y caracteres peligrosos', () => {
    expect(sanitizeOriginalName('../../etc/passwd')).toBe('passwd');
    expect(sanitizeOriginalName('C:\\fotos\\río<1>.jpg')).toBe('río_1_.jpg');
  });

  it('limita la longitud y evita nombres vacíos', () => {
    expect(sanitizeOriginalName('a'.repeat(300))).toHaveLength(150);
    expect(sanitizeOriginalName('   ')).toBe('archivo');
  });
});
