import { NotificationBody } from "@/components/ui/notification-body";
import { BlurView } from "expo-blur";
import { useContentBlur } from "@/hooks/use-content-blur";
import { useDismissGesture } from "@/hooks/use-dismiss-gesture";
import { useDynamicNotifications } from "@/hooks/use-dynamic-notifications";
import { useNotificationContentStyle } from "@/hooks/use-notification-content-style";
import type { INotificationContent } from "@/interfaces/notification-content.interface";
import React, { memo } from "react";
import { StyleSheet } from "react-native";
import { GestureDetector } from "react-native-gesture-handler";
import Animated from "react-native-reanimated";

const Content: React.FC<INotificationContent> &
  React.FunctionComponent<INotificationContent> = memo<INotificationContent>(
  ({
    style,
  }: INotificationContent):
    | (React.ReactNode & React.ReactElement & React.JSX.Element)
    | null => {
    const {
      layout,
      notification,
      isVisible,
      drop,
      expand,
      reveal,
      dragY,
      dismiss,
      cardColor,
      reduceTransparency,
      dismissAccessibilityLabel,
    } = useDynamicNotifications();

    const animated = useNotificationContentStyle({
      drop,
      expand,
      reveal,
      offset: dragY,
      layout,
    });
    const blur = useContentBlur({ reveal });
    const gesture = useDismissGesture({
      offset: dragY,
      onDismiss: dismiss,
      onPress: notification?.onPress,
    });

    if (!notification) {
      return null;
    }

    return (
      <GestureDetector gesture={gesture}>
        <Animated.View
          pointerEvents={isVisible ? "auto" : "none"}
          accessible={Boolean(notification)}
          accessibilityRole="alert"
          accessibilityLabel={[notification.title, notification.message].filter(Boolean).join(". ")}
          accessibilityLiveRegion="polite"
          accessibilityActions={[{ name: "dismiss", label: dismissAccessibilityLabel }]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === "dismiss") dismiss();
          }}
          style={[
            styles.content,
            {
              top: layout.cardTop,
              left: layout.cardLeft,
              width: layout.cardWidth,
              height: layout.cardHeight,
              borderRadius: layout.cardRadius,
              backgroundColor: reduceTransparency ? cardColor : "transparent",
            },
            animated,
            style,
          ]}
        >
          {notification.render ? (
            notification.render(notification)
          ) : (
            <NotificationBody notification={notification} />
          )}

          {reduceTransparency ? null : (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: layout.cardRadius }, styles.blur, blur.animatedStyle]}>
              <BlurView intensity={36} tint="default" style={StyleSheet.absoluteFill} />
            </Animated.View>
          )}
        </Animated.View>
      </GestureDetector>
    );
  },
);

const styles = StyleSheet.create({
  content: {
    position: "absolute",
    overflow: "hidden",
    borderCurve: "continuous",
  },
  blur: {
    borderCurve: "continuous",
  },
});

export { Content };
