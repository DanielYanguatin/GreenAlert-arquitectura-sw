import reactHooks from 'eslint-plugin-react-hooks';
import { createConfig } from '../eslint.base.mjs';

export default [
  ...createConfig(import.meta.dirname, { env: 'browser' }),
  { ignores: ['jest.config.cjs', 'vite.config.ts'] },
  {
    files: ['**/*.tsx', '**/*.ts'],
    plugins: { 'react-hooks': reactHooks },
    rules: { ...reactHooks.configs.recommended.rules },
  },
];
