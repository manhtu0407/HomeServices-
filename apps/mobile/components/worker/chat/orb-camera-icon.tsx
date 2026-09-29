import { LiquidNavIcon } from '@/components/customer/dock/liquid-nav-icons'

export function WorkerV5KaelOrbCameraIcon({ color: strokeColor, size = 20 }: { color: string; size?: number }) {
  return <LiquidNavIcon color={strokeColor} name="camera" selected size={size} testID="worker-v5-kael-orb-camera-icon" />
}
