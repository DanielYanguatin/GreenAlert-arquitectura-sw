// Configuración ESLint compartida (solo herramienta de desarrollo, no se usa en tiempo de ejecución).
// Cada paquete la importa desde su propio eslint.config.mjs y puede ampliarla.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import sonarjs from 'eslint-plugin-sonarjs';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

/**
 * @param {string} tsconfigRootDir directorio del paquete que usa la configuración
 * @param {{ env?: 'node' | 'browser' }} [options]
 */
export function createConfig(tsconfigRootDir, options = {}) {
  const env = options.env ?? 'node';
  return tseslint.config(
    { ignores: ['dist/**', 'coverage/**', 'node_modules/**', 'eslint.config.mjs', 'jest.config.js', '*.config.ts'] },
    js.configs.recommended,
    ...tseslint.configs.recommendedTypeChecked,
    {
      languageOptions: {
        globals: env === 'node' ? { ...globals.node, ...globals.jest } : { ...globals.browser, ...globals.jest },
        parserOptions: { projectService: true, tsconfigRootDir },
      },
      plugins: { sonarjs },
      rules: {
        // Variables no utilizadas (se permite el prefijo _ para parámetros obligatorios por firma)
        '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
        // Tipos inseguros
        '@typescript-eslint/no-explicit-any': 'error',
        '@typescript-eslint/no-unsafe-assignment': 'error',
        '@typescript-eslint/no-unsafe-member-access': 'error',
        '@typescript-eslint/no-unsafe-call': 'error',
        '@typescript-eslint/no-unsafe-return': 'error',
        '@typescript-eslint/no-unsafe-argument': 'error',
        // Manejo incorrecto de promesas
        '@typescript-eslint/no-floating-promises': 'error',
        '@typescript-eslint/no-misused-promises': 'error',
        '@typescript-eslint/await-thenable': 'error',
        '@typescript-eslint/require-await': 'error',
        // Errores potenciales y malas prácticas
        eqeqeq: ['error', 'always'],
        'no-console': 'error',
        'no-duplicate-imports': 'error',
        'no-return-assign': 'error',
        'no-param-reassign': 'error',
        'prefer-const': 'error',
        'no-var': 'error',
        // Duplicación y complejidad (eslint-plugin-sonarjs)
        'sonarjs/no-identical-functions': 'error',
        'sonarjs/no-duplicate-string': ['warn', { threshold: 4 }],
        'sonarjs/no-all-duplicated-branches': 'error',
        'sonarjs/no-identical-conditions': 'error',
        'sonarjs/cognitive-complexity': ['warn', 15],
      },
    },
    {
      // En pruebas se toleran literales repetidos (nombres de casos) y aserciones de mocks.
      files: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.int-spec.ts', 'test/**/*.ts'],
      rules: {
        'sonarjs/no-duplicate-string': 'off',
        '@typescript-eslint/unbound-method': 'off',
      },
    },
    prettier,
  );
}
