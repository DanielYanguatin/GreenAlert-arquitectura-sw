import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { compare, hash } from 'bcryptjs';

/** Encapsula el algoritmo de hash (bcrypt) para poder cambiarlo sin tocar la lógica de autenticación. */
@Injectable()
export class PasswordHasher {
  private readonly rounds: number;

  constructor(config: ConfigService) {
    const configured = Number(config.get('BCRYPT_ROUNDS') ?? 12);
    // Nunca por debajo de 10 rondas, incluso si se configura mal.
    this.rounds = Number.isInteger(configured) && configured >= 10 ? configured : 12;
  }

  hash(plain: string): Promise<string> {
    return hash(plain, this.rounds);
  }

  verify(plain: string, passwordHash: string): Promise<boolean> {
    return compare(plain, passwordHash);
  }
}
