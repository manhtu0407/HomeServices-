// ESLint flat config for the Expo mobile app (ESLint 9 + eslint-config-expo).
// Kept minimal: the Expo preset already covers React, React Native, hooks, and
// import rules. We only add ignore globs and jest globals for test files.
const expoConfig = require('eslint-config-expo/flat')

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'coverage/**', 'expo-env.d.ts'],
  },
  {
    files: ['**/__tests__/**', '**/*-test.ts', '**/*-test.tsx', 'jest.setup.ts'],
    languageOptions: {
      globals: {
        jest: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
      },
    },
    rules: {
      // jest.mock factories are hoisted and must use require(); the system-under-test
      // import is intentionally placed after the jest.mock calls.
      '@typescript-eslint/no-require-imports': 'off',
      'import/first': 'off',
    },
  },
]
