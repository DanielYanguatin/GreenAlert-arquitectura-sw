import { ConfigService } from '@nestjs/config';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { LocalDiskStorage } from './storage';

describe('LocalDiskStorage', () => {
  let dir: string;
  let storage: LocalDiskStorage;

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'ga-storage-'));
    storage = new LocalDiskStorage(new ConfigService({ UPLOAD_DIR: dir }));
    await storage.onModuleInit();
  });

  afterEach(() => rm(dir, { recursive: true, force: true }));

  it('guarda, abre y elimina archivos', async () => {
    await storage.save('a.jpg', Buffer.from('hola'));
    expect((await readFile(join(dir, 'a.jpg'))).toString()).toBe('hola');
    const stream = await storage.open('a.jpg');
    stream.destroy();
    await storage.remove('a.jpg');
    await expect(storage.open('a.jpg')).rejects.toThrow();
  });

  it('no sobrescribe archivos existentes', async () => {
    await storage.save('b.jpg', Buffer.from('1'));
    await expect(storage.save('b.jpg', Buffer.from('2'))).rejects.toThrow();
  });

  it('bloquea path traversal', async () => {
    await expect(storage.save('../fuera.jpg', Buffer.from('x'))).rejects.toThrow('Ruta de almacenamiento no válida');
  });
});
