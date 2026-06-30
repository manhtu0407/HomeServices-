import { Image } from 'expo-image'
import { StatusBar } from 'expo-status-bar'
import { ScrollView, StyleSheet, Text, useWindowDimensions, View, type ImageStyle } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import Svg, { Path, Rect } from 'react-native-svg'

const kaelHead = require('../../assets/kael-model-8a-head.png')
const roleIcons = {
  customer: require('../../assets/common-image-icons/common-role-home.png'),
  worker: require('../../assets/common-image-icons/common-role-repair.png'),
} as const

const decorTokens = {
  canvas: '#F8FBF5',
  base: '#FFFDF7',
  raised: '#FFFFFF',
  surface: '#FAFFFD',
  mint: '#DCFBF3',
  mintSoft: '#E8F9F4',
  mintDeep: '#08786E',
  cyan: '#E8FCFA',
  cream: '#FFF8EB',
  ink: '#12231F',
  muted: '#647672',
  subtle: '#7D958F',
  line: 'rgba(35,96,84,0.13)',
  supportLine: 'rgba(20,73,66,0.08)',
  mintAura: 'rgba(76,222,199,0.10)',
  mintAuraHome: 'rgba(76,222,199,0.12)',
  mintAuraStrong: 'rgba(76,222,199,0.17)',
  mintAuraSubtle: 'rgba(76,222,199,0.105)',
  shadow: '0 22px 50px rgba(13,70,65,0.11)',
  softShadow: '0 12px 26px rgba(17,70,61,0.07)',
}

export function LoginDecorPrototypeSurface() {
  const { width } = useWindowDimensions()
  const frameWidth = Math.min(width, 430)
  const contentWidth = Math.max(320, Math.min(frameWidth - 34, 362))

  return (
    <SafeAreaView style={styles.safe} testID="login-decor-prototype">
      <StatusBar style="dark" />
      <View style={styles.canvas}>
        <DecorBackdrop />
        <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} style={styles.scroll}>
          <View style={[styles.shell, { width: contentWidth }]}>
            <View pointerEvents="none" style={styles.shellMintColumn} />
            <View style={styles.header}>
              <View style={styles.headerCopy}>
                <Text style={styles.title}>Chọn vai trò</Text>
                <Text style={styles.subtitle}>Tiếp tục đúng trải nghiệm của bạn</Text>
              </View>
              <View style={styles.kaelBadge}>
                <Image contentFit="contain" source={kaelHead} style={styles.kaelImage as ImageStyle} />
              </View>
            </View>

            <View style={styles.hero}>
              <View pointerEvents="none" style={styles.heroMintPanel} />
              <View pointerEvents="none" style={styles.heroDivider} />
              <HeroMapLines />
              <View style={styles.heroTop}>
                <Text style={styles.brandPill}>Home Services</Text>
                <View style={styles.paletteRail} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={[styles.paletteDot, styles.paletteDotMintStrong]} />
                  <View style={[styles.paletteDot, styles.paletteDotMintSoft]} />
                  <View style={[styles.paletteDot, styles.paletteDotOreoSupport]} />
                </View>
              </View>
              <View style={styles.heroBody}>
                <View style={styles.heroTitleBlock}>
                  <Text style={styles.heroTitle}>Việc nhà đúng người, đúng lúc</Text>
                  <Text style={styles.heroMeta}>Kael mở đúng trải nghiệm cho từng vai trò.</Text>
                </View>
                <View style={styles.heroAvatar}>
                  <Image contentFit="contain" source={kaelHead} style={styles.heroAvatarImage as ImageStyle} />
                </View>
              </View>
              <View style={styles.signatureBar}>
                <View style={styles.signatureStripe} />
                <Text style={styles.signatureText}>Đúng người, đúng việc, đúng lúc nhà cần.</Text>
              </View>
            </View>

            <View style={styles.roleStack}>
              <PrototypeRoleCard
                active
                description="Gửi yêu cầu và theo dõi dịch vụ"
                icon={roleIcons.customer}
                label="Khách"
                meta={['Google', 'Số điện thoại']}
              />
              <PrototypeRoleCard
                description="Đăng nhập hoặc tạo hồ sơ"
                icon={roleIcons.worker}
                label="Thợ"
                meta={['Tài khoản thợ', 'Xác thực']}
                warm
              />
            </View>
          </View>
        </ScrollView>
      </View>
    </SafeAreaView>
  )
}

function DecorBackdrop() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 390 844" preserveAspectRatio="none">
      <Path d="M-40 180 C60 128 142 196 228 154 S340 118 438 154" fill="none" opacity={0.34} stroke={decorTokens.line} strokeWidth={6} />
      <Path d="M-34 330 C58 284 142 344 232 304 S332 264 424 306" fill="none" opacity={0.16} stroke={decorTokens.supportLine} strokeWidth={3} />
      <Path d="M-42 706 C62 660 136 726 228 684 S346 636 434 680" fill="none" opacity={0.26} stroke={decorTokens.line} strokeWidth={6} />
      <Rect fill={decorTokens.mint} height={58} opacity={0.16} rx={20} width={92} x={30} y={266} />
      <Rect fill={decorTokens.cyan} height={70} opacity={0.18} rx={22} width={120} x={232} y={720} />
    </Svg>
  )
}

function HeroMapLines() {
  return (
    <Svg pointerEvents="none" style={StyleSheet.absoluteFill} viewBox="0 0 330 236" preserveAspectRatio="none">
      <Path d="M16 44 C64 22 106 30 154 22 S244 0 330 34" fill="none" opacity={0.48} stroke="rgba(255,255,255,0.58)" strokeLinecap="round" strokeWidth={1.3} />
      <Path d="M-18 92 C50 58 108 78 166 52 S258 22 346 62" fill="none" opacity={0.62} stroke="rgba(20,73,66,0.10)" strokeLinecap="round" strokeWidth={1.1} />
      <Path d="M-22 168 C64 126 122 164 190 132 S274 106 346 138" fill="none" opacity={0.52} stroke="rgba(20,73,66,0.10)" strokeLinecap="round" strokeWidth={1.1} />
      <Path d="M60 -16 C78 56 78 134 60 244 M156 -18 C144 58 152 142 182 246 M266 -18 C242 60 256 144 312 246" fill="none" opacity={0.62} stroke="rgba(20,73,66,0.055)" strokeLinecap="round" strokeWidth={0.9} />
    </Svg>
  )
}

function PrototypeRoleCard({
  active = false,
  description,
  icon,
  label,
  meta,
  warm = false,
}: {
  active?: boolean
  description: string
  icon: number
  label: string
  meta: string[]
  warm?: boolean
}) {
  return (
    <View style={[styles.roleCard, active ? styles.roleCardActive : warm ? styles.roleCardWarm : styles.roleCardNeutral]}>
      <View style={[styles.roleIconStage, warm ? styles.roleIconStageWarm : styles.roleIconStageMint]}>
        <Image contentFit="contain" source={icon} style={styles.roleIconImage as ImageStyle} />
      </View>
      <View style={styles.roleCopy}>
        <Text style={styles.roleTitle}>{label}</Text>
        <Text style={styles.roleDescription}>{description}</Text>
        <View style={styles.metaRow}>
          {meta.map((item) => (
            <Text key={item} numberOfLines={1} style={styles.metaPill}>
              {item}
            </Text>
          ))}
        </View>
      </View>
      <View style={[styles.arrowButton, active ? styles.arrowButtonActive : styles.arrowButtonQuiet]}>
        <Svg width={18} height={18} viewBox="0 0 18 18" fill="none">
          <Path d="m7 4.5 4.5 4.5L7 13.5" stroke={active ? decorTokens.raised : decorTokens.mintDeep} strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.2} />
        </Svg>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  safe: { backgroundColor: decorTokens.canvas, flex: 1 },
  canvas: { alignItems: 'center', backgroundColor: decorTokens.canvas, flex: 1, overflow: 'hidden' },
  scroll: { width: '100%' },
  scrollContent: { alignItems: 'center', minHeight: '100%', paddingBottom: 24, paddingTop: 48 },
  shell: {
    backgroundColor: 'rgba(255,253,247,0.94)',
    borderColor: 'rgba(255,255,255,0.82)',
    borderRadius: 36,
    borderWidth: 1,
    boxShadow: decorTokens.shadow,
    experimental_backgroundImage: 'linear-gradient(180deg, rgba(255,253,247,0.96), rgba(248,251,245,0.94))',
    gap: 16,
    overflow: 'hidden',
    padding: 16,
    paddingTop: 18,
    position: 'relative',
  } as any,
  shellMintColumn: {
    backgroundColor: 'rgba(76,222,199,0.13)',
    bottom: 0,
    opacity: 0.86,
    position: 'absolute',
    right: 0,
    top: 0,
    width: 72,
    zIndex: 0,
  },
  header: { alignItems: 'center', flexDirection: 'row', gap: 12, justifyContent: 'space-between', position: 'relative', zIndex: 1 },
  headerCopy: { flex: 1, gap: 4, minWidth: 0 },
  title: { color: decorTokens.ink, fontSize: 26, fontWeight: '600', letterSpacing: 0, lineHeight: 31 },
  subtitle: { color: decorTokens.muted, fontSize: 12.5, fontWeight: '700', lineHeight: 17 },
  kaelBadge: {
    alignItems: 'center',
    backgroundColor: 'rgba(250,255,253,0.92)',
    borderColor: 'rgba(35,96,84,0.13)',
    borderRadius: 23,
    borderWidth: 1,
    boxShadow: decorTokens.softShadow,
    height: 56,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 56,
  } as any,
  kaelImage: { height: 64, transform: [{ translateY: 5 }], width: 64 },
  hero: {
    backgroundColor: 'rgba(255,255,255,0.40)',
    borderColor: 'rgba(255,255,255,0.58)',
    borderRadius: 34,
    borderWidth: 1,
    boxShadow: '0 18px 42px rgba(20,73,66,0.11), 0 0 0 1px rgba(255,255,255,0.76), inset 0 1px 0 rgba(255,255,255,0.82)',
    experimental_backgroundImage: 'radial-gradient(circle at 62% 20%, rgba(23,169,149,0.07), transparent 31%), linear-gradient(155deg, rgba(255,255,255,0.78), rgba(242,246,245,0.46) 64%, rgba(255,255,255,0.62))',
    gap: 18,
    minHeight: 236,
    overflow: 'hidden',
    padding: 17,
    position: 'relative',
  } as any,
  heroMintPanel: {
    backgroundColor: 'rgba(76,222,199,0.15)',
    bottom: 0,
    position: 'absolute',
    right: 0,
    top: 0,
    width: '36%',
    zIndex: 0,
  },
  heroDivider: { backgroundColor: 'rgba(255,255,255,0.72)', height: 1, left: 17, position: 'absolute', right: 17, top: 72 },
  heroTop: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', zIndex: 1 },
  brandPill: {
    backgroundColor: 'rgba(255,253,248,0.96)',
    borderColor: decorTokens.supportLine,
    borderRadius: 999,
    borderWidth: 1,
    boxShadow: '0 7px 16px rgba(17,70,61,0.030), inset 0 1px 0 rgba(255,255,255,0.78)',
    color: decorTokens.mintDeep,
    fontSize: 11,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 12,
    paddingVertical: 8,
  } as any,
  paletteRail: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.62)',
    borderColor: decorTokens.supportLine,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 5,
    minHeight: 28,
    paddingHorizontal: 8,
  },
  paletteDot: { borderRadius: 999, height: 9, width: 9 },
  paletteDotMintStrong: { backgroundColor: '#4CDEC7' },
  paletteDotMintSoft: { backgroundColor: decorTokens.mint },
  paletteDotOreoSupport: { backgroundColor: decorTokens.ink, opacity: 0.18 },
  heroBody: { alignItems: 'center', flexDirection: 'row', gap: 12, minHeight: 78, zIndex: 1 },
  heroTitleBlock: { flex: 1, gap: 7 },
  heroTitle: { color: decorTokens.ink, fontSize: 24, fontWeight: '600', letterSpacing: 0, lineHeight: 29 },
  heroMeta: { color: decorTokens.muted, fontSize: 12.5, fontWeight: '700', lineHeight: 17, maxWidth: 190 },
  heroAvatar: {
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.80)',
    borderColor: 'rgba(255,255,255,0.88)',
    borderRadius: 26,
    borderWidth: 1,
    boxShadow: '0 12px 24px rgba(17,24,23,0.09)',
    height: 70,
    justifyContent: 'center',
    overflow: 'hidden',
    width: 70,
  } as any,
  heroAvatarImage: { height: 82, transform: [{ translateY: 7 }], width: 82 },
  signatureBar: {
    alignItems: 'center',
    backgroundColor: 'rgba(250,255,253,0.82)',
    borderColor: decorTokens.supportLine,
    borderRadius: 24,
    borderWidth: 1,
    boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.92)',
    flexDirection: 'row',
    gap: 12,
    minHeight: 62,
    paddingHorizontal: 13,
    paddingVertical: 11,
    zIndex: 1,
  } as any,
  signatureStripe: { backgroundColor: decorTokens.mintDeep, borderRadius: 999, height: 42, width: 8 },
  signatureText: { color: decorTokens.ink, flex: 1, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  roleStack: { gap: 12, position: 'relative', zIndex: 1 },
  roleCard: {
    alignItems: 'center',
    borderRadius: 30,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 13,
    minHeight: 112,
    overflow: 'hidden',
    padding: 16,
    position: 'relative',
  },
  roleCardActive: {
    backgroundColor: decorTokens.mintSoft,
    borderColor: 'rgba(20,117,105,0.13)',
    boxShadow: '0 12px 26px rgba(31,92,82,0.055), inset 0 1px 0 rgba(255,255,255,0.86)',
    experimental_backgroundImage: `radial-gradient(circle at 78% 18%, rgba(76,222,199,0.20), transparent 34%), radial-gradient(circle at 18% 100%, rgba(255,255,255,0.66), transparent 42%), linear-gradient(180deg, rgba(232,249,244,0.96), rgba(255,253,248,0.90))`,
  } as any,
  roleCardNeutral: { backgroundColor: decorTokens.surface, borderColor: 'rgba(20,73,66,0.08)' },
  roleCardWarm: {
    backgroundColor: decorTokens.cream,
    borderColor: 'rgba(35,96,84,0.10)',
    boxShadow: '0 12px 26px rgba(31,92,82,0.045), inset 0 1px 0 rgba(255,255,255,0.86)',
    experimental_backgroundImage: `radial-gradient(circle at 78% 18%, ${decorTokens.mintAuraSubtle}, transparent 34%), radial-gradient(circle at 18% 100%, rgba(255,255,255,0.66), transparent 42%), linear-gradient(180deg, rgba(255,248,235,0.96), rgba(255,253,248,0.90))`,
  } as any,
  roleIconStage: { alignItems: 'center', borderRadius: 22, borderWidth: 1, height: 58, justifyContent: 'center', width: 58 },
  roleIconStageMint: { backgroundColor: 'rgba(245,255,252,0.72)', borderColor: 'rgba(20,117,105,0.08)', boxShadow: '0 0 0 5px rgba(76,222,199,0.070), 0 12px 24px rgba(23,169,149,0.080), inset 0 1px 0 rgba(255,255,255,0.82)' },
  roleIconStageWarm: { backgroundColor: 'rgba(245,255,252,0.72)', borderColor: 'rgba(20,117,105,0.08)', boxShadow: '0 0 0 5px rgba(76,222,199,0.060), inset 0 1px 0 rgba(255,255,255,0.82)' },
  roleIconImage: { height: 64, width: 64 },
  roleCopy: { flex: 1, gap: 5, minWidth: 0 },
  roleTitle: { color: decorTokens.ink, fontSize: 20, fontWeight: '600', letterSpacing: 0, lineHeight: 24 },
  roleDescription: { color: decorTokens.muted, fontSize: 14, fontWeight: '700', lineHeight: 20 },
  metaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  metaPill: {
    backgroundColor: 'rgba(255,255,255,0.82)',
    borderColor: 'rgba(8,124,114,0.18)',
    borderRadius: 999,
    borderWidth: 1,
    color: decorTokens.mintDeep,
    fontSize: 10,
    fontWeight: '600',
    maxWidth: 126,
    overflow: 'hidden',
    paddingHorizontal: 9,
    paddingVertical: 5,
  },
  arrowButton: { alignItems: 'center', borderRadius: 19, borderWidth: 1, height: 40, justifyContent: 'center', width: 40 },
  arrowButtonActive: {
    backgroundColor: decorTokens.mintDeep,
    borderColor: 'rgba(255,255,255,0.82)',
    boxShadow: '0 14px 28px rgba(8,120,110,0.22)',
  } as any,
  arrowButtonQuiet: { backgroundColor: 'rgba(255,255,252,0.86)', borderColor: decorTokens.supportLine },
})
