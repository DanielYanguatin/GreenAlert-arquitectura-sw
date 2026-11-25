import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../common/identity';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 160, unique: true })
  email: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ name: 'full_name', type: 'varchar', length: 120 })
  fullName: string;

  @Column({ type: 'varchar', length: 20, nullable: true })
  phone: string | null;

  @Column({ type: 'enum', enum: Role, default: Role.CIUDADANO })
  role: Role;

  @Column({ type: 'varchar', length: 80, nullable: true })
  entity: string | null;

  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ name: 'created_at', type: 'datetime', precision: 3 })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'datetime', precision: 3 })
  updatedAt: Date;
}

/** Vista pública del usuario (nunca incluye el hash de la contraseña). */
export interface UserView {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  entity: string | null;
  active: boolean;
  createdAt: Date;
}

export function toUserView(u: User): UserView {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    role: u.role,
    entity: u.entity,
    active: u.active,
    createdAt: u.createdAt,
  };
}
