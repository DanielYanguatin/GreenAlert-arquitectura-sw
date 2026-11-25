import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsLatitude,
  IsLongitude,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

const STATUSES = ['PENDIENTE', 'EN_REVISION', 'EN_PROCESO', 'RESUELTO', 'RECHAZADO'] as const;

export class PointDto {
  @ApiProperty({ example: 1.148 })
  @Type(() => Number)
  @IsLatitude({ message: 'Latitud no válida (debe estar entre -90 y 90)' })
  latitude: number;

  @ApiProperty({ example: -76.646 })
  @Type(() => Number)
  @IsLongitude({ message: 'Longitud no válida (debe estar entre -180 y 180)' })
  longitude: number;
}

export class UpsertLocationDto extends PointDto {
  @ApiProperty({ example: 'BASURA' })
  @IsString()
  @Matches(/^[A-Z_]{2,40}$/, { message: 'Categoría no válida' })
  category: string;

  @ApiProperty({ enum: STATUSES })
  @IsIn(STATUSES)
  status: string;

  @ApiProperty()
  @IsString()
  @Length(1, 120)
  title: string;

  @ApiProperty()
  @IsDateString()
  reportedAt: string;
}

export class GeoJsonQueryDto {
  @ApiPropertyOptional({ example: '86001' })
  @IsOptional()
  @IsString()
  @MaxLength(10)
  municipality?: string;

  @ApiPropertyOptional({ example: 'BASURA' })
  @IsOptional()
  @Matches(/^[A-Z_]{2,40}$/)
  category?: string;

  @ApiPropertyOptional({ enum: STATUSES })
  @IsOptional()
  @IsIn(STATUSES)
  status?: string;

  @ApiPropertyOptional({ description: 'minLng,minLat,maxLng,maxLat', example: '-76.7,1.1,-76.6,1.2' })
  @IsOptional()
  @Matches(/^-?\d+(\.\d+)?(,-?\d+(\.\d+)?){3}$/, { message: 'bbox debe tener el formato minLng,minLat,maxLng,maxLat' })
  bbox?: string;
}

export class NearQueryDto extends PointDto {
  @ApiPropertyOptional({ default: 2, maximum: 50, description: 'Radio en kilómetros' })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0.05)
  @Max(50)
  radiusKm = 2;
}

export class UpdateMunicipalityDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  minLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLatitude()
  maxLat?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  minLng?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsLongitude()
  maxLng?: number;
}
