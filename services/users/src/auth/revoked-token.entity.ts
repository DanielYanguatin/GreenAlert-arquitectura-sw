import { Column, CreateDateColumn, Entity, PrimaryColumn } from 'typeorm';

@Entity({ name: 'revoked_tokens' })
export class RevokedToken {
  @PrimaryColumn({ type: 'char', length: 36 })
  jti: string;

  @Column({ name: 'user_id', type: 'char', length: 36 })
  userId: string;

  @Column({ name: 'expires_at', type: 'datetime', precision: 3 })
  expiresAt: Date;

  @CreateDateColumn({ name: 'revoked_at', type: 'datetime', precision: 3 })
  revokedAt: Date;
}
