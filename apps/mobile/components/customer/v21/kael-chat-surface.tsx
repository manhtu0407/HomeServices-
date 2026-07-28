import { CustomerKaelChatContent } from '../kael-chat/customer-kael-chat-content'
import { useCustomerKaelSurfaceController } from '../kael-chat/use-customer-kael-surface-controller'

export function KaelChatSurface({ stateScopeKey }: { stateScopeKey: string }) {
  const controller = useCustomerKaelSurfaceController(stateScopeKey)
  return <CustomerKaelChatContent controller={controller} />
}
