import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsLatitude,
  IsLongitude,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { ReportCategory, ReportStatus } from '../report.domain';

const trim = ({ value }: { value: unknown }): unknown => (typeof value === 'string' ? value.trim() : value);

export class CreateReportDto {
  @ApiProperty({ example: 'Basuras acumuladas junto al río Mulato' })
  @Transform(trim)
  @IsString()
  @Length(5, 120)
  title: string;

  @ApiProperty({ example: 'Desde hace una semana hay bolsas de basura en la orilla del río.' })
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  description: string;

  @ApiProperty({ enum: ReportCategory })
  @IsEnum(ReportCategory, { message: 'Categoría ambiental no válida' })
  category: ReportCategory;

  @ApiProperty({ example: 1.1522 })
  @Type(() => Number)
  @IsLatitude({ message: 'Latitud no válida' })
  latitude: number;

  @ApiProperty({ example: -76.6464 })
  @Type(() => Number)
  @IsLongitude({ message: 'Longitud no válida' })
  longitude: number;

  @ApiPropertyOptional({ example: 'Barrio San Miguel, puente peatonal' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(200)
  address?: string;
}

export class UpdateReportDto {
  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(5, 120)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @Transform(trim)
  @IsString()
  @Length(10, 2000)
  description?: string;

  @ApiPropertyOptional({ enum: ReportCategory })
  @IsOptional()
  @IsEnum(ReportCategory, { message: 'Categoría ambiental no válida' })
  category?: ReportCategory;
}

export class ChangeStatusDto {
  @ApiProperty({ enum: ReportStatus })
  @IsEnum(ReportStatus)
  status: ReportStatus;

  @ApiPropertyOptional({ description: 'Obligatorio para RESUELTO y RECHAZADO' })
  @IsOptional()
  @Transform(trim)
  @IsString()
  @MaxLength(500)
  comment?: string;
}

export class AssignDto {
  @ApiProperty({ description: 'Usuario institucional responsable' })
  @IsUUID('4')
  assigneeId: string;
}

export class ObservationDto {
  @ApiProperty()
  @Transform(trim)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  text: string;
}

export class ListReportsQueryDto {
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

  @ApiPropertyOptional({ enum: ReportStatus })
  @IsOptional()
  @IsEnum(ReportStatus)
  status?: ReportStatus;

  @ApiPropertyOptional({ enum: ReportCategory })
  @IsOptional()
  @IsEnum(ReportCategory)
  category?: ReportCategory;

  @ApiPropertyOptional({ example: '86001' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  municipality?: string;

  @ApiPropertyOptional({ description: 'UUID del responsable, o "me" para los asignados al usuario actual' })
  @IsOptional()
  @IsString()
  @MaxLength(36)
  assignedTo?: string;
}
