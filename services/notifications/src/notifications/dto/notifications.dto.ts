import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { NotificationStatus, NotificationType } from '../notification.entity';

const ROLES = ['ADMIN', 'CIUDADANO', 'FUNCIONARIO', 'GESTOR_AMBIENTAL'] as const;

export class CreateNotificationDto {
  @ApiProperty({ enum: NotificationType })
  @IsEnum(NotificationType)
  type: NotificationType;

  @ApiPropertyOptional({ description: 'Destinatario individual (excluyente con recipientRoles)' })
  @ValidateIf((o: CreateNotificationDto) => !o.recipientRoles)
  @IsUUID('4')
  recipientUserId?: string;

  @ApiPropertyOptional({ description: 'Correo ya conocido por el emisor (evita una consulta a users)' })
  @IsOptional()
  @IsEmail()
  recipientEmail?: string;

  @ApiPropertyOptional({
    enum: ROLES,
    isArray: true,
    description: 'Difusión a todos los usuarios activos con estos roles',
  })
  @ValidateIf((o: CreateNotificationDto) => !o.recipientUserId)
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(4)
  @IsIn(ROLES, { each: true })
  recipientRoles?: string[];

  @ApiProperty({ description: 'Datos para la plantilla' })
  @IsObject()
  data: Record<string, unknown>;
}

export class ListNotificationsQueryDto {
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

  @ApiPropertyOptional({ enum: NotificationStatus })
  @IsOptional()
  @IsEnum(NotificationStatus)
  status?: NotificationStatus;
}
