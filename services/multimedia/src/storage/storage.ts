import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createReadStream, type ReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import { join, resolve, sep } from 'node:path';

export const STORAGE = Symbol('STORAGE');

/**
 * Puerto de almacenamiento de binarios. La implementación local escribe en un volumen;
 * puede sustituirse por un almacenamiento de objetos (S3/MinIO) sin cambiar el dominio.
 */
export interface StoragePort {
  save(storedName: string, data: Buffer): Promise<void>;
  open(storedName: string): Promise<ReadStream>;
  remove(storedName: string): Promise<void>;
}

@Injectable()
export class LocalDiskStorage implements StoragePort, OnModuleInit {
  private readonly logger = new Logger(LocalDiskStorage.name);
  private readonly root: string;

  constructor(config: ConfigService) {
    this.root = resolve(config.get<string>('UPLOAD_DIR') ?? '/data/uploads');
  }

  async onModuleInit(): Promise<void> {
    await mkdir(this.root, { recursive: true });
    this.logger.log(`Almacenamiento de evidencias en ${this.root}`);
  }

  /** Evita path traversal: la ruta final debe quedar dentro del directorio raíz. */
  private pathFor(storedName: string): string {
    const full = resolve(join(this.root, storedName));
    if (!full.startsWith(this.root + sep)) throw new Error('Ruta de almacenamiento no válida');
    return full;
  }

  async save(storedName: string, data: Buffer): Promise<void> {
    await writeFile(this.pathFor(storedName), data, { flag: 'wx', mode: 0o640 });
  }

  async open(storedName: string): Promise<ReadStream> {
    const path = this.pathFor(storedName);
    await stat(path); // lanza ENOENT si no existe
    return createReadStream(path);
  }

  async remove(storedName: string): Promise<void> {
    await rm(this.pathFor(storedName), { force: true });
  }
}
