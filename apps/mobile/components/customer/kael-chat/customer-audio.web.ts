type WebRecorder = {
  getURI: () => string | null
  prepareToRecordAsync: () => Promise<void>
  record: () => Promise<void>
  stop: () => Promise<void>
}

export const AudioModule = {
  requestRecordingPermissionsAsync: async () => ({ granted: false }),
}

export const RecordingPresets = {
  HIGH_QUALITY: {},
}

export async function setAudioModeAsync(_options: unknown) {
  return undefined
}

export function useAudioRecorder(_preset: unknown): WebRecorder {
  return {
    getURI: () => null,
    prepareToRecordAsync: async () => undefined,
    record: async () => undefined,
    stop: async () => undefined,
  }
}

export function useAudioRecorderState(_recorder: WebRecorder, _intervalMs?: number) {
  return {
    durationMillis: 0,
    isRecording: false,
  }
}
