import { clamp } from "@/logic/clamp.default";
import type { SharedValue } from "react-native-reanimated";
import { useAnimatedStyle } from "react-native-reanimated";

interface IUseContentBlur {
  reveal: SharedValue<number>;
}

const useContentBlur = ({ reveal }: IUseContentBlur) => {
  const animatedStyle = useAnimatedStyle(() => {
    return { opacity: 1 - clamp(reveal.value, 0, 1) };
  });

  return { animatedStyle };
};

export { useContentBlur };
export type { IUseContentBlur };
