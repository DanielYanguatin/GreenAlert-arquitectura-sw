import { Inject, Injectable, Logger, ServiceUnavailableException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import { type ClassificationInput, IMAGE_CLASSIFIER, type ImageClassifier } from '../classifiers/classifier.port';
import { Classification } from './classification.entity';

export interface ClassificationView {
  id: string;
  reportId: string;
  suggestedCategory: string;
  confidence: number;
  scores: Record<string, number>;
  provider: string;
  modelVersion: string;
  requiresReview: boolean;
  createdAt: Date;
}

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);

  constructor(
    @InjectRepository(Classification) private readonly classifications: Repository<Classification>,
    @Inject(IMAGE_CLASSIFIER) private readonly classifier: ImageClassifier,
  ) {}

  /** Clasifica y registra el resultado. La sugerencia SIEMPRE requiere revisión humana. */
  async classify(input: ClassificationInput): Promise<ClassificationView> {
    let output;
    try {
      output = await this.classifier.classify(input);
    } catch (e) {
      this.logger.warn(`Clasificador no disponible para el reporte ${input.reportId}: ${(e as Error).message}`);
      throw new ServiceUnavailableException('El clasificador no está disponible temporalmente');
    }
    const saved = await this.classifications.save(
      this.classifications.create({
        reportId: input.reportId,
        evidenceIds: input.evidences.map((e) => e.id),
        suggestedCategory: output.suggestedCategory,
        confidence: output.confidence,
        scores: output.scores as Record<string, number>,
        provider: output.provider,
        modelVersion: output.modelVersion,
        requiresReview: true,
      }),
    );
    return toView(saved);
  }

  async byReport(reportId: string): Promise<ClassificationView[]> {
    const rows = await this.classifications.find({ where: { reportId }, order: { createdAt: 'DESC' }, take: 50 });
    return rows.map(toView);
  }
}

function toView(c: Classification): ClassificationView {
  return {
    id: c.id,
    reportId: c.reportId,
    suggestedCategory: c.suggestedCategory,
    confidence: c.confidence,
    scores: c.scores,
    provider: c.provider,
    modelVersion: c.modelVersion,
    requiresReview: c.requiresReview,
    createdAt: c.createdAt,
  };
}
