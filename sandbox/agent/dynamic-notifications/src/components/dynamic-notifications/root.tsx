import { PALETTE } from "@/conf/palette";
import {
  GOO_BLUR_MAX,
  GOO_BLUR_MIN,
  GOO_GAIN,
  GOO_STRENGTH,
  GOO_THRESHOLD,
} from "@/constants/notification.consts";
import { DynamicNotificationsContext } from "@/context";
import { getNotificationLayout } from "@/helpers";
import { useNotificationTimeline } from "@/hooks/use-notification-timeline";
import type { IDynamicNotifications } from "@/interfaces/dynamic-notifications.interface";
import { clamp } from "@/logic/clamp.default";
import { mix } from "@/logic/mix.default";
import { memo, useEffect, useMemo, useState } from "react";
import { AccessibilityInfo, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Overlay } from "./overlay";

const Root: React.FC<IDynamicNotifications> &
  React.FunctionComponent<IDynamicNotifications> = memo<IDynamicNotifications>(
  ({
    children,
    strength = GOO_STRENGTH,
    blur,
    gain = GOO_GAIN,
    threshold = GOO_THRESHOLD,
    islandWidth,
    islandHeight,
    islandTop,
    islandColor = PALETTE.island,
    cardWidth,
    cardHeight,
    cardRadius,
    cardColor = PALETTE.card,
    shadowColor = PALETTE.shadow,
    accent = PALETTE.accent,
    gap,
    duration,
    style,
    onDismiss,
    reduceMotion,
    reduceTransparency = false,
    dismissAccessibilityLabel = "Dismiss notification",
  }: IDynamicNotifications):
    | (React.ReactNode & React.ReactElement & React.JSX.Element)
    | null => {
    const { width, fontScale } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const [systemReduceMotion, setSystemReduceMotion] = useState(false);

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

    const resolvedReduceMotion = reduceMotion ?? systemReduceMotion;

    const layout = useMemo(
      () =>
        getNotificationLayout({
          width,
          insetTop: insets.top,
          islandWidth,
          islandHeight,
          islandTop,
          cardWidth,
          cardHeight: cardHeight ?? Math.max(74, Math.round(74 * Math.max(fontScale, 1))),
          cardRadius,
          gap,
        }),
      [
        width,
        insets.top,
        islandWidth,
        islandHeight,
        islandTop,
        cardWidth,
        cardHeight,
        fontScale,
        cardRadius,
        gap,
      ],
    );

    const radius = useMemo(
      () => blur ?? mix(clamp(strength, 0, 1), GOO_BLUR_MIN, GOO_BLUR_MAX),
      [blur, strength],
    );

    const timeline = useNotificationTimeline({ onDismiss, duration, reduceMotion: resolvedReduceMotion });

    const value = useMemo(
      () => ({
        trigger: timeline.trigger,
        dismiss: timeline.dismiss,
        isVisible: timeline.isVisible,
        notification: timeline.notification,
        drop: timeline.drop,
        expand: timeline.expand,
        reveal: timeline.reveal,
        tint: timeline.tint,
        dragY: timeline.dragY,
        layout,
        islandColor,
        cardColor,
        shadowColor,
        accent,
        blur: radius,
        gain,
        threshold,
        reduceMotion: resolvedReduceMotion,
        reduceTransparency,
        dismissAccessibilityLabel,
      }),
      [
        timeline.trigger,
        timeline.dismiss,
        timeline.isVisible,
        timeline.notification,
        timeline.drop,
        timeline.expand,
        timeline.reveal,
        timeline.tint,
        timeline.dragY,
        layout,
        islandColor,
        cardColor,
        shadowColor,
        accent,
        radius,
        gain,
        threshold,
        resolvedReduceMotion,
        reduceTransparency,
        dismissAccessibilityLabel,
      ],
    );

    return (
      <DynamicNotificationsContext.Provider value={value}>
        <View style={[styles.root, style]}>
          {children}
          <Overlay />
        </View>
      </DynamicNotificationsContext.Provider>
    );
  },
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

export { Root };
