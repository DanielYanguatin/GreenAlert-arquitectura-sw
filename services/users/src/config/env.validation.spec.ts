import { validateEnv } from './env.validation';

const valid = {
  DB_HOST: 'h',
  DB_USER: 'u',
  DB_PASSWORD: 'p',
  DB_NAME: 'n',
  INTERNAL_API_KEY: 'x'.repeat(24),
  JWT_SECRET: 's'.repeat(32),
};

describe('validateEnv', () => {
  it('acepta una configuración completa', () => {
    expect(validateEnv(valid)).toBe(valid);
  });

  it('informa las variables ausentes', () => {
    expect(() => validateEnv({ ...valid, DB_HOST: '' })).toThrow('DB_HOST');
  });

  it('rechaza secretos débiles', () => {
    expect(() => validateEnv({ ...valid, JWT_SECRET: 'corto' })).toThrow('JWT_SECRET');
    expect(() => validateEnv({ ...valid, INTERNAL_API_KEY: 'corto' })).toThrow('INTERNAL_API_KEY');
  });
});
