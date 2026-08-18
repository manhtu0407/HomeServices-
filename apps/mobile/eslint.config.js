// ESLint flat config for the Expo mobile app (ESLint 9 + eslint-config-expo).
// Kept minimal: the Expo preset covers React, React Native, hooks, and imports.
const expoConfig = require('eslint-config-expo/flat')

module.exports = [
  ...expoConfig,
  {
    ignores: ['node_modules/**', '.expo/**', 'dist/**', 'coverage/**', '.scratch/**', 'expo-env.d.ts'],
  },
  {
    rules: {
      // React Compiler lint does not model Reanimated shared-value writes yet.
      // Keep the core Hooks rules on, but avoid treating `.value` animation
      // assignments as immutable React state.
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
    },
  },
  {
    files: ['**/__tests__/**', '**/*-test.ts', '**/*-test.tsx', 'jest.setup.ts'],
    languageOptions: {
      globals: {
        afterAll: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        beforeEach: 'readonly',
        describe: 'readonly',
        expect: 'readonly',
        it: 'readonly',
        jest: 'readonly',
        test: 'readonly',
      },
    },
    rules: {
      // jest.mock factories are hoisted and must use require(); SUT imports are
      // intentionally placed after jest.mock calls in RN component tests.
      '@typescript-eslint/no-require-imports': 'off',
      'import/first': 'off',
    },
  },
]
