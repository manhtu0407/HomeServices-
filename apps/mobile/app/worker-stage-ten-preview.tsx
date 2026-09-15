import { useRouter } from 'expo-router'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

import { StageTenContent } from '@/components/worker/jobs/stage-ten/stage-ten-content'
import { useGlassAccessibility } from '@/components/ui/accessibility-motion'
import { buildWorkerStageTenRuntime } from '@/components/worker/jobs/stage-ten/stage-ten-runtime'
import { useFrontendWorkflow } from '@/lib/frontend-workflow-provider'
import { useJobMediaPreviewUrls } from '@/lib/job-media-preview'

export default function WorkerStageTenPreview() {
  const router = useRouter()
  const runtime = useFrontendWorkflow()
  const { reduceTransparency } = useGlassAccessibility()
  const { model, photoRef } = buildWorkerStageTenRuntime(runtime, 'vi')
  const [photoPreview] = useJobMediaPreviewUrls([photoRef])

  if (!__DEV__) {
    return (
      <SafeAreaView style={styles.unavailable}>
        <Text>Tính năng này không khả dụng.</Text>
      </SafeAreaView>
    )
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.previewShell}>
          <StageTenContent
            actions={{
              onEarnings: () => router.replace('/(worker)/earnings?ns_worker_screen=4.1-earnings-overview&ns_worker_earnings_period=month' as never),
              onRanking: () => router.replace('/(worker)/profile?ns_worker_screen=5.2-worker-ranking' as never),
            }}
            language="vi"
            model={model}
            photoSource={photoPreview ? { uri: photoPreview } : null}
            reduceTransparency={reduceTransparency}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    padding: 20,
    paddingBottom: 48,
  },
  previewShell: {
    width: '100%',
  },
  safeArea: {
    backgroundColor: '#FFFFFF',
    flex: 1,
  },
  unavailable: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    flex: 1,
    justifyContent: 'center',
    padding: 24,
  },
})
