import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsString,
  IsUrl,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class EvidenceRefDto {
  @ApiProperty()
  @IsUUID('4')
  id: string;

  @ApiProperty({ description: 'URL interna del archivo en multimedia' })
  @IsUrl({ require_tld: false, protocols: ['http', 'https'] })
  url: string;

  @ApiProperty({ enum: ['image/jpeg', 'image/png', 'image/webp'] })
  @IsIn(['image/jpeg', 'image/png', 'image/webp'])
  mimeType: string;

  @ApiProperty()
  @IsString()
  @MaxLength(150)
  originalName: string;
}

export class ClassifyDto {
  @ApiProperty()
  @IsUUID('4')
  reportId: string;

  @ApiProperty({ description: 'Título y descripción del reporte' })
  @IsString()
  @MaxLength(2200)
  text: string;

  @ApiProperty({ type: [EvidenceRefDto] })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => EvidenceRefDto)
  evidences: EvidenceRefDto[];
}

export class ReportIdQueryDto {
  @ApiProperty()
  @IsUUID('4')
  reportId: string;
}
