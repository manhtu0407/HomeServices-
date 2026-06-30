// Customer UI styles — merged from domain partitions to keep each file within the structure ratchet.
// Spreading three StyleSheet.create results preserves every `styles.<key>` call site unchanged.
import { customerStyles1 } from './styles-1'
import { customerStyles2 } from './styles-2'
import { customerStyles3 } from './styles-3'

export const styles = { ...customerStyles1, ...customerStyles2, ...customerStyles3 }
