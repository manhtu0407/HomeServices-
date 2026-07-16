import { CustomerKaelChatContent } from './customer-kael-chat-content'
import { useCustomerKaelSurfaceController } from './use-customer-kael-surface-controller'

export function KaelChatSurface({ stateScopeKey }: { stateScopeKey: string }) {
  const controller = useCustomerKaelSurfaceController(stateScopeKey)
  return <CustomerKaelChatContent controller={controller} />
}
