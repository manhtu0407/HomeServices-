// Jest config for the Expo React Native app.
//
// The jest-expo preset already provides the Expo/RN babel transform
// (expo/internal/babel-preset.js), asset mocks, transformIgnorePatterns, and the
// base setupFiles. We only layer our own after-env setup on top, so this stays
// intentionally small. Do not duplicate what the preset already sets.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  // React Native Testing Library suites share enough RN/Expo globals that
  // parallel workers can starve async UI tests on Windows. Serial execution is
  // both faster and deterministic for the current mobile gate.
  maxWorkers: 1,
  // Mirror the tsconfig "@/*" path alias so component tests can import app code
  // the same way the app does. Metro reads tsconfig paths; jest does not.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^@babel/runtime/(.*)$': '<rootDir>/node_modules/@babel/runtime/$1',
  },
  // Match every test path with a platform-neutral regex. Expanding <rootDir> into a glob
  // escapes Windows worktree segments such as `.claude` and can silently collect zero
  // suites, so a zero-test mobile run must fail instead of becoming a false-green gate.
  testRegex: '.*test\\.[jt]sx?$',
  passWithNoTests: false,
}
