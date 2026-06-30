import { type ViewStyle } from 'react-native'
import { type CustomerThemeTokens } from '@/components/customer/customer-theme'

export type KaelPaintTone =
  | 'agent'
  | 'avatar'
  | 'brief'
  | 'composer'
  | 'customerBubble'
  | 'field'
  | 'header'
  | 'icon'
  | 'index'
  | 'kaelIntroBubble'
  | 'kaelBubble'
  | 'pill'
  | 'phaseContext'
  | 'phaseField'
  | 'send'
  | 'status'
  | 'step'
  | 'trace'

export function kaelSurfacePaint(tokens: CustomerThemeTokens, tone: KaelPaintTone): ViewStyle | null {
  const reduceTransparency = tokens.glassHighlight === 'transparent' && tokens.glassShadow === 'none'
  if (reduceTransparency) return { boxShadow: 'none' } as ViewStyle
  const dark = tokens.mode === 'dark'
  const lightShadow = tone === 'agent' || tone === 'brief' || tone === 'phaseContext'
    ? '0 15px 36px rgba(16,74,66,0.11), inset 0 1px 0 rgba(255,255,255,0.88)'
    : tone === 'header'
      ? '0 15px 36px rgba(16,74,66,0.12), inset 0 1px 0 rgba(255,255,255,0.92)'
      : tone === 'composer'
        ? '0 18px 40px rgba(16,74,66,0.12), inset 0 1px 0 rgba(255,255,255,0.92)'
        : tone === 'kaelBubble' || tone === 'kaelIntroBubble' || tone === 'customerBubble' || tone === 'trace'
          ? '0 8px 18px rgba(16,74,66,0.09), inset 0 1px 0 rgba(255,255,255,0.74)'
          : tone === 'send'
            ? '0 10px 22px rgba(8,139,124,0.22), inset 0 1px 0 rgba(255,255,255,0.22)'
            : '0 6px 14px rgba(16,74,66,0.06), inset 0 1px 0 rgba(255,255,255,0.72)'
  const darkShadow = tone === 'agent' || tone === 'brief' || tone === 'phaseContext' || tone === 'composer' || tone === 'header'
    ? '0 16px 34px rgba(0,0,0,0.22), inset 0 1px 0 rgba(255,255,255,0.10)'
    : '0 8px 18px rgba(0,0,0,0.16), inset 0 1px 0 rgba(255,255,255,0.08)'
  const lightGradients: Record<KaelPaintTone, string> = {
    agent: 'radial-gradient(circle at 92% 0%, rgba(156,238,221,0.82), transparent 32%), radial-gradient(circle at 4% 100%, rgba(255,245,229,0.76), transparent 36%), linear-gradient(145deg, rgba(255,253,248,0.98), rgba(224,249,243,0.93))',
    avatar: 'linear-gradient(145deg, rgba(255,253,248,0.98), rgba(232,252,247,0.78))',
    brief: 'radial-gradient(circle at 95% 10%, rgba(255,227,183,0.62), transparent 35%), linear-gradient(150deg, rgba(217,251,242,0.92), rgba(255,246,231,0.76))',
    composer: 'linear-gradient(135deg, rgba(255,253,248,0.98), rgba(239,255,250,0.94))',
    customerBubble: 'linear-gradient(135deg, rgba(193,249,237,0.98), rgba(239,255,250,0.94))',
    field: 'linear-gradient(145deg, rgba(255,253,248,0.92), rgba(239,255,250,0.72))',
    header: 'radial-gradient(circle at 88% 16%, rgba(156,238,221,0.74), transparent 32%), linear-gradient(135deg, rgba(255,253,248,0.98), rgba(226,250,244,0.98))',
    icon: 'linear-gradient(145deg, rgba(217,251,242,0.95), rgba(255,253,248,0.82))',
    index: 'linear-gradient(145deg, rgba(193,249,237,0.94), rgba(255,253,248,0.80))',
    kaelIntroBubble: 'radial-gradient(circle at 88% 16%, rgba(76,222,199,0.12), transparent 38%), linear-gradient(145deg, rgba(255,255,255,0.98), rgba(245,255,252,0.94))',
    kaelBubble: 'linear-gradient(145deg, rgba(255,253,248,0.98), rgba(255,249,239,0.92))',
    pill: 'linear-gradient(135deg, rgba(217,251,242,0.95), rgba(255,253,248,0.82))',
    phaseContext: 'radial-gradient(circle at 88% 8%, rgba(76,222,199,0.16), transparent 38%), radial-gradient(circle at 8% 100%, rgba(255,255,255,0.68), transparent 32%), linear-gradient(145deg, rgba(255,255,255,0.96), rgba(243,255,251,0.91))',
    phaseField: 'radial-gradient(circle at 78% 16%, rgba(76,222,199,0.10), transparent 40%), linear-gradient(145deg, rgba(255,255,255,0.96), rgba(248,255,253,0.84))',
    send: 'linear-gradient(145deg, #49CFC0, #24B3A1 50%, #088779)',
    status: 'linear-gradient(135deg, rgba(217,251,242,0.96), rgba(255,253,248,0.80))',
    step: 'linear-gradient(145deg, rgba(255,253,248,0.86), rgba(232,252,247,0.78))',
    trace: 'linear-gradient(145deg, rgba(255,253,248,0.94), rgba(236,252,247,0.82))',
  }
  const darkGradients: Record<KaelPaintTone, string> = {
    agent: 'radial-gradient(circle at 92% 0%, rgba(105,222,198,0.20), transparent 34%), radial-gradient(circle at 4% 100%, rgba(224,160,107,0.14), transparent 38%), linear-gradient(145deg, rgba(22,43,40,0.98), rgba(17,59,53,0.92))',
    avatar: 'linear-gradient(145deg, rgba(31,62,57,0.98), rgba(17,45,41,0.92))',
    brief: 'radial-gradient(circle at 95% 10%, rgba(224,160,107,0.18), transparent 35%), linear-gradient(150deg, rgba(23,59,53,0.96), rgba(59,41,27,0.72))',
    composer: 'linear-gradient(135deg, rgba(22,43,40,0.98), rgba(17,50,45,0.94))',
    customerBubble: 'linear-gradient(135deg, rgba(28,78,69,0.96), rgba(22,54,49,0.94))',
    field: 'linear-gradient(145deg, rgba(22,43,40,0.96), rgba(18,48,43,0.82))',
    header: 'radial-gradient(circle at 88% 16%, rgba(105,222,198,0.18), transparent 30%), linear-gradient(135deg, rgba(21,43,40,0.98), rgba(18,48,43,0.94))',
    icon: 'linear-gradient(145deg, rgba(31,62,57,0.98), rgba(17,45,41,0.92))',
    index: 'linear-gradient(145deg, rgba(31,82,72,0.96), rgba(18,48,43,0.86))',
    kaelIntroBubble: 'radial-gradient(circle at 88% 16%, rgba(105,222,198,0.075), transparent 40%), linear-gradient(145deg, rgba(22,43,40,0.96), rgba(17,29,27,0.90))',
    kaelBubble: 'linear-gradient(145deg, rgba(22,43,40,0.98), rgba(40,34,28,0.88))',
    pill: 'linear-gradient(135deg, rgba(26,66,59,0.98), rgba(18,45,41,0.88))',
    phaseContext: 'radial-gradient(circle at 88% 8%, rgba(105,222,198,0.11), transparent 38%), radial-gradient(circle at 8% 100%, rgba(190,210,205,0.045), transparent 32%), linear-gradient(145deg, rgba(23,43,40,0.96), rgba(17,31,29,0.88))',
    phaseField: 'radial-gradient(circle at 78% 16%, rgba(105,222,198,0.070), transparent 40%), linear-gradient(145deg, rgba(23,43,40,0.94), rgba(18,32,30,0.82))',
    send: 'linear-gradient(145deg, #49CFC0, #24B3A1 58%, #088779)',
    status: 'linear-gradient(135deg, rgba(26,66,59,0.98), rgba(22,43,40,0.84))',
    step: 'linear-gradient(145deg, rgba(24,50,46,0.98), rgba(19,57,51,0.78))',
    trace: 'linear-gradient(145deg, rgba(22,43,40,0.96), rgba(17,54,49,0.82))',
  }
  const borderColor = dark
    ? tone === 'brief' || tone === 'agent' || tone === 'phaseContext' ? 'rgba(105,222,198,0.28)' : 'rgba(105,222,198,0.20)'
    : tone === 'brief' || tone === 'agent' || tone === 'phaseContext' || tone === 'composer' || tone === 'header'
      ? 'rgba(8,139,124,0.30)'
      : 'rgba(8,139,124,0.22)'
  const backgroundImage = dark ? darkGradients[tone] : lightGradients[tone]

  return {
    backgroundImage,
    borderColor,
    boxShadow: dark ? darkShadow : lightShadow,
    experimental_backgroundImage: backgroundImage,
  } as ViewStyle
}
