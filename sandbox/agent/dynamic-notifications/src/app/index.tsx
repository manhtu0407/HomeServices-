import { DynamicNotifications } from "@/components";
import { useDynamicNotifications } from "@/hooks/use-dynamic-notifications";
import type { IDynamicNotification } from "@/interfaces/dynamic-notification.interface";
import { StatusBar } from "expo-status-bar";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AccessibilityInfo,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useColorScheme,
  useWindowDimensions,
  View,
} from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

type Language = "vi" | "en";

const COPY = {
  vi: {
    sandbox: "BẢN THỬ · CHỈ DÙNG KIỂM THỬ",
    title: "Thông báo dạng Dynamic Island",
    description: "Mẫu độc lập để kiểm tra hiển thị, cử chỉ và khả năng tiếp cận. Không kết nối backend.",
    theme: "Giao diện",
    reduceMotion: "Giảm chuyển động",
    reduceTransparency: "Giảm độ trong suốt",
    section: "Tình huống kiểm thử",
    auto: "Thông báo tự ẩn",
    persistent: "Giữ thông báo đến khi đóng",
    rapid: "Thay thế liên tiếp",
    custom: "Nội dung tuỳ chỉnh",
    dismiss: "Đóng thông báo",
    callback: "Số lần hàm gọi khi đóng:",
    lastEvent: "Sự kiện gần nhất:",
    none: "Chưa có",
    light: "Sáng",
    dark: "Tối",
    notificationTitle: "Thông báo thử nghiệm",
    notificationMessage: "Chỉ dùng để kiểm tra giao diện.",
    customTitle: "Nội dung tuỳ chỉnh",
    customMessage: "Bản dựng giữ API nội dung tuỳ chỉnh.",
    first: "Mục thứ nhất",
    latest: "Mục cuối sẽ được giữ lại",
    tapped: "Thao tác nhấn đã được gọi",
    systemMotion: "Thiết bị đang bật chế độ giảm chuyển động.",
    gestureHint: "Vuốt lên hoặc dùng hành động Đóng của trình đọc màn hình.",
  },
  en: {
    sandbox: "SANDBOX · TEST USE ONLY",
    title: "Dynamic Island notifications",
    description: "An isolated sample for layout, gestures, and accessibility. No backend connection.",
    theme: "Appearance",
    reduceMotion: "Reduce Motion",
    reduceTransparency: "Reduce Transparency",
    section: "Test scenarios",
    auto: "Auto-dismiss notification",
    persistent: "Keep until dismissed (duration: null)",
    rapid: "Rapid replacement",
    custom: "Custom content",
    dismiss: "Dismiss notification",
    callback: "onDismiss calls:",
    lastEvent: "Last event:",
    none: "None yet",
    light: "Light",
    dark: "Dark",
    notificationTitle: "Sandbox test notification",
    notificationMessage: "For UI verification only.",
    customTitle: "Custom notification content",
    customMessage: "This build preserves the upstream render API.",
    first: "First item",
    latest: "Only the latest pending item remains",
    tapped: "onPress callback ran",
    systemMotion: "System Reduce Motion is enabled.",
    gestureHint: "Swipe up or use the screen reader Dismiss action.",
  },
} as const;

export default function Home() {
  const [language, setLanguage] = useState<Language>("vi");
  const [darkOverride, setDarkOverride] = useState<boolean | null>(null);
  const [reduceMotionOverride, setReduceMotionOverride] = useState(false);
  const [reduceTransparency, setReduceTransparency] = useState(false);
  const [systemReduceMotion, setSystemReduceMotion] = useState(false);
  const [dismissCount, setDismissCount] = useState(0);
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const systemTheme = useColorScheme();
  const { fontScale } = useWindowDimensions();
  const dark = darkOverride ?? systemTheme === "dark";
  const reduceMotion = systemReduceMotion || reduceMotionOverride;
  const copy = COPY[language];
  const colors = useMemo(() => dark
    ? { background: "#111318", foreground: "#F4F5F7", muted: "#A8AEB9", surface: "#222630", border: "#3A404C", accent: "#A8D8FF", island: "#050607", card: "#252A34", shadow: "#000000" }
    : { background: "#F3F5F8", foreground: "#191D25", muted: "#596170", surface: "#FFFFFF", border: "#D9DEE7", accent: "#075FB5", island: "#08090B", card: "#FFFFFF", shadow: "#202633" }, [dark]);

  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (active) setSystemReduceMotion(enabled);
    });
    const subscription = AccessibilityInfo.addEventListener("reduceMotionChanged", setSystemReduceMotion);
    return () => {
      active = false;
      subscription.remove();
    };
  }, []);

  return (
    <GestureHandlerRootView style={styles.fill}>
      <SafeAreaProvider>
        <DynamicNotifications
          duration={2400}
          cardHeight={Math.max(74, Math.round(74 * Math.max(fontScale, 1)))}
          islandColor={colors.island}
          cardColor={colors.card}
          shadowColor={colors.shadow}
          accent={colors.accent}
          reduceMotion={reduceMotion}
          reduceTransparency={reduceTransparency}
          dismissAccessibilityLabel={copy.dismiss}
          onDismiss={() => setDismissCount((count) => count + 1)}
        >
          <StatusBar style={dark ? "light" : "dark"} />
          <SafeAreaView style={[styles.fill, { backgroundColor: colors.background }]}>
            <DemoContent
              language={language}
              setLanguage={setLanguage}
              dark={dark}
              setDarkOverride={setDarkOverride}
              reduceMotion={reduceMotion}
              setReduceMotionOverride={setReduceMotionOverride}
              reduceTransparency={reduceTransparency}
              setReduceTransparency={setReduceTransparency}
              dismissCount={dismissCount}
              lastEvent={lastEvent}
              setLastEvent={setLastEvent}
              colors={colors}
              copy={copy}
              systemReduceMotion={systemReduceMotion}
            />
          </SafeAreaView>
        </DynamicNotifications>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

type DemoProps = {
  language: Language;
  setLanguage: (language: Language) => void;
  dark: boolean;
  setDarkOverride: (dark: boolean | null) => void;
  reduceMotion: boolean;
  setReduceMotionOverride: (enabled: boolean) => void;
  reduceTransparency: boolean;
  setReduceTransparency: (enabled: boolean) => void;
  dismissCount: number;
  lastEvent: string | null;
  setLastEvent: (event: string) => void;
  colors: { background: string; foreground: string; muted: string; surface: string; border: string; accent: string; island: string; card: string; shadow: string };
  copy: (typeof COPY)[Language];
  systemReduceMotion: boolean;
};

function DemoContent(props: DemoProps) {
  const { trigger, dismiss, isVisible } = useDynamicNotifications();
  const pendingNotificationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { language, copy, colors } = props;
  const simpleNotification = (duration?: number | null): IDynamicNotification => ({
    id: `sandbox-${Date.now()}`,
    title: copy.notificationTitle,
    message: copy.notificationMessage,
    duration,
    symbol: { ios: "bell.fill", android: "notifications", web: "notifications" },
    onPress: () => props.setLastEvent(copy.tapped),
  });

  const send = (duration?: number | null) => trigger(simpleNotification(duration));
  useEffect(() => () => {
    if (pendingNotificationTimer.current) clearTimeout(pendingNotificationTimer.current);
  }, []);
  const sendRapidPair = () => {
    if (pendingNotificationTimer.current) clearTimeout(pendingNotificationTimer.current);
    trigger({ ...simpleNotification(null), id: "sandbox-first", title: copy.first });
    pendingNotificationTimer.current = setTimeout(() => {
      pendingNotificationTimer.current = null;
      trigger({ ...simpleNotification(2400), id: "sandbox-latest", title: copy.latest });
    }, 80);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={[styles.eyebrow, { color: colors.accent }]}>{copy.sandbox}</Text>
      <Text accessibilityRole="header" style={[styles.title, { color: colors.foreground }]}>{copy.title}</Text>
      <Text style={[styles.description, { color: colors.muted }]}>{copy.description}</Text>

      <View style={styles.controlRow}>
        <ActionButton label={language === "vi" ? "VI" : "EN"} selected onPress={() => props.setLanguage(language === "vi" ? "en" : "vi")} colors={colors} />
        <ActionButton label={`${copy.theme}: ${props.dark ? copy.dark : copy.light}`} onPress={() => props.setDarkOverride(!props.dark)} colors={colors} />
      </View>
      <View style={styles.controlRow}>
        <ActionButton label={`${copy.reduceMotion}: ${props.reduceMotion ? "ON" : "OFF"}`} selected={props.reduceMotion} onPress={() => props.setReduceMotionOverride(!props.reduceMotion)} colors={colors} />
        <ActionButton label={`${copy.reduceTransparency}: ${props.reduceTransparency ? "ON" : "OFF"}`} selected={props.reduceTransparency} onPress={() => props.setReduceTransparency(!props.reduceTransparency)} colors={colors} />
      </View>

      <Text accessibilityRole="header" style={[styles.sectionTitle, { color: colors.foreground }]}>{copy.section}</Text>
      <ActionButton label={copy.auto} onPress={() => send(1800)} colors={colors} fullWidth />
      <ActionButton label={copy.persistent} onPress={() => send(null)} colors={colors} fullWidth />
      <ActionButton label={copy.rapid} onPress={sendRapidPair} colors={colors} fullWidth />
      <ActionButton label={copy.custom} onPress={() => trigger({
        ...simpleNotification(2400),
        title: copy.customTitle,
        message: copy.customMessage,
        render: () => (
          <View accessible accessibilityRole="text" accessibilityLabel={`${copy.customTitle}. ${copy.customMessage}`} style={styles.customContent}>
            <Text style={[styles.customTitle, { color: colors.accent }]}>{copy.customTitle}</Text>
            <Text style={[styles.customMessage, { color: colors.foreground }]}>{copy.customMessage}</Text>
          </View>
        ),
      })} colors={colors} fullWidth />
      <ActionButton label={copy.dismiss} onPress={dismiss} colors={colors} fullWidth disabled={!isVisible} />

      <View style={[styles.status, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.statusText, { color: colors.foreground }]}>{copy.callback} {props.dismissCount}</Text>
        <Text style={[styles.statusText, { color: colors.foreground }]}>{copy.lastEvent} {props.lastEvent ?? copy.none}</Text>
        {props.systemReduceMotion ? <Text style={[styles.statusHint, { color: colors.muted }]}>{copy.systemMotion}</Text> : null}
        <Text style={[styles.statusHint, { color: colors.muted }]}>{copy.gestureHint}</Text>
      </View>
    </ScrollView>
  );
}

function ActionButton({ label, onPress, colors, selected = false, fullWidth = false, disabled = false }: {
  label: string;
  onPress: () => void;
  colors: DemoProps["colors"];
  selected?: boolean;
  fullWidth?: boolean;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.button, fullWidth && styles.fullWidth, { backgroundColor: selected ? colors.accent : colors.surface, borderColor: colors.border, opacity: disabled ? 0.5 : pressed ? 0.78 : 1 }]}
    >
      <Text style={[styles.buttonText, { color: selected ? "#FFFFFF" : colors.foreground }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingHorizontal: 22, paddingTop: 22, paddingBottom: 40, gap: 14 },
  eyebrow: { fontSize: 12, fontWeight: "800", letterSpacing: 0.8 },
  title: { fontSize: 29, lineHeight: 36, fontWeight: "800", letterSpacing: -0.7 },
  description: { fontSize: 16, lineHeight: 23, marginBottom: 4 },
  controlRow: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  sectionTitle: { fontSize: 19, lineHeight: 26, fontWeight: "700", marginTop: 8 },
  button: { minHeight: 46, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, borderRadius: 15, justifyContent: "center" },
  fullWidth: { width: "100%" },
  buttonText: { fontSize: 15, lineHeight: 21, fontWeight: "600" },
  status: { padding: 15, borderWidth: 1, borderRadius: 18, gap: 6, marginTop: 6 },
  statusText: { fontSize: 14, lineHeight: 20 },
  statusHint: { fontSize: 13, lineHeight: 19 },
  customContent: { flex: 1, justifyContent: "center", paddingHorizontal: 18, gap: 3 },
  customTitle: { fontSize: 17, lineHeight: 22, fontWeight: "700" },
  customMessage: { fontSize: 14, lineHeight: 19 },
});
