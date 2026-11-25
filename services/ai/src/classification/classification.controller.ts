import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AI_CATEGORIES, CATEGORY_LABELS } from '../classifiers/classifier.port';
import { Public, Roles, STAFF_ROLES } from '../common/identity';
import { type ClassificationView, ClassificationService } from './classification.service';
import { ClassifyDto, ReportIdQueryDto } from './dto/classification.dto';

@ApiTags('classifications')
@Controller('classifications')
export class ClassificationController {
  constructor(private readonly service: ClassificationService) {}

  @Get('categories')
  @Public()
  @ApiOperation({ summary: 'Categorías que el clasificador puede sugerir' })
  categories(): { code: string; label: string }[] {
    return AI_CATEGORIES.map((code) => ({ code, label: CATEGORY_LABELS[code] }));
  }

  @Get()
  @ApiBearerAuth()
  @Roles(...STAFF_ROLES)
  @ApiOperation({ summary: 'Historial de clasificaciones de un reporte (personal institucional)' })
  byReport(@Query() query: ReportIdQueryDto): Promise<ClassificationView[]> {
    return this.service.byReport(query.reportId);
  }
}

@ApiTags('internal')
@Controller('internal/classifications')
export class InternalClassificationController {
  constructor(private readonly service: ClassificationService) {}

  @Post()
  @Public()
  @ApiOperation({ summary: '[Interno] Clasifica las evidencias de un reporte (llamado por reports)' })
  classify(@Body() dto: ClassifyDto): Promise<ClassificationView> {
    return this.service.classify(dto);
  }
}
