// Test-environment setup, loaded after the jest framework is ready.

// react-native-reanimated v4 relies on the react-native-worklets runtime, which
// does not exist under jsdom/node. Use the package's official mock so components
// that import reanimated (directly or via the glass motion helpers) render.
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'))

// Glass is native (expo-glass-effect / expo-blur). In tests, render children as
// plain Views and report no liquid glass, so glass surfaces mount without the
// native layer while preserving testID/children for queries.
jest.mock('expo-glass-effect', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    GlassView: ({ children, ...props }: any) => React.createElement(View, props, children),
    isLiquidGlassAvailable: () => false,
  }
})
jest.mock('expo-blur', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    BlurView: ({ children, ...props }: any) => React.createElement(View, props, children),
  }
})

jest.mock('expo-audio', () => ({
  AudioModule: {
    requestRecordingPermissionsAsync: jest.fn(async () => ({ granted: true })),
  },
  RecordingPresets: {
    HIGH_QUALITY: {},
  },
  setAudioModeAsync: jest.fn(async () => undefined),
  useAudioRecorder: () => ({
    getURI: jest.fn(() => null),
    prepareToRecordAsync: jest.fn(async () => undefined),
    record: jest.fn(async () => undefined),
    stop: jest.fn(async () => undefined),
  }),
  useAudioRecorderState: () => ({
    durationMillis: 0,
    isRecording: false,
  }),
}))

jest.mock('lottie-react-native', () => {
  const React = require('react')
  const { View } = require('react-native')
  return ({ ...props }: any) => React.createElement(View, props)
})

// Accessibility prefs are environmental. Default them to "off" in tests so the
// async AccessibilityInfo probes inside useGlassAccessibility don't fire state
// updates after assertions (which otherwise log act(...) warnings).
jest.mock('@/components/ui/accessibility-motion', () => ({
  useGlassAccessibility: () => ({ reduceMotion: false, reduceTransparency: false }),
}))
