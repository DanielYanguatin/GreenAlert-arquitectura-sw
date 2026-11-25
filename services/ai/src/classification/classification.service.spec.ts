import { ServiceUnavailableException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { Classification } from './classification.entity';
import { ClassificationService } from './classification.service';

describe('ClassificationService', () => {
  const input = {
    reportId: 'r1',
    text: 'basura',
    evidences: [{ id: 'e1', url: 'http://mm/x', mimeType: 'image/jpeg', originalName: 'a.jpg' }],
  };
  let repo: Record<string, jest.Mock>;
  let classifier: { classify: jest.Mock };
  let service: ClassificationService;

  beforeEach(() => {
    repo = {
      create: jest.fn((c: Partial<Classification>) => c),
      save: jest.fn((c: Classification) => Promise.resolve({ ...c, id: 'c1', createdAt: new Date() })),
      find: jest.fn().mockResolvedValue([]),
    };
    classifier = {
      classify: jest.fn().mockResolvedValue({
        suggestedCategory: 'BASURA',
        confidence: 0.5,
        scores: { BASURA: 0.5 },
        provider: 'heuristic-keywords',
        modelVersion: 'v0',
      }),
    };
    service = new ClassificationService(repo as unknown as Repository<Classification>, classifier);
  });

  it('registra el resultado y marca que requiere revisión humana', async () => {
    const res = await service.classify(input);
    expect(res).toMatchObject({ id: 'c1', suggestedCategory: 'BASURA', requiresReview: true });
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({ evidenceIds: ['e1'], provider: 'heuristic-keywords' }),
    );
  });

  it('responde 503 si el clasificador falla, sin registrar resultados', async () => {
    classifier.classify.mockRejectedValue(new Error('modelo caído'));
    await expect(service.classify(input)).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('consulta el historial por reporte', async () => {
    await service.byReport('r1');
    expect(repo.find).toHaveBeenCalledWith(expect.objectContaining({ where: { reportId: 'r1' } }));
  });
});
