import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsIn, IsInt, IsOptional, IsString, Length, Matches, Max, Min } from 'class-validator';
import { Role } from '../../common/identity';

/** Entidades ambientales contempladas (no implica integración oficial). */
export const ENVIRONMENTAL_ENTITIES = [
  'CORPOAMAZONIA',
  'ALCALDIA_MOCOA',
  'GOBERNACION_PUTUMAYO',
  'PARQUES_NACIONALES',
  'MINAMBIENTE',
] as const;

export class UpdateProfileDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @Length(3, 120)
  fullName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Matches(/^\+?\d{7,15}$/, { message: 'Teléfono no válido' })
  phone?: string;
}

export class ChangeRoleDto {
  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiPropertyOptional({ enum: ENVIRONMENTAL_ENTITIES })
  @IsOptional()
  @IsIn(ENVIRONMENTAL_ENTITIES)
  entity?: (typeof ENVIRONMENTAL_ENTITIES)[number];
}

export class ChangeStatusDto {
  @ApiProperty()
  @IsBoolean()
  active: boolean;
}

export class ListUsersQueryDto {
  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page = 1;

  @ApiPropertyOptional({ default: 20, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit = 20;

  @ApiPropertyOptional({ enum: Role })
  @IsOptional()
  @IsEnum(Role)
  role?: Role;
}
