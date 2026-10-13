import { readdirSync, readFileSync } from 'node:fs'
import { dirname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const read = (path) => readFileSync(resolve(root, path), 'utf8')
function readTree(directory) {
  return readdirSync(resolve(root, directory), { withFileTypes: true }).map((entry) => {
    const path = `${directory}/${entry.name}`
    return entry.isDirectory() ? readTree(path) : read(path)
  }).join('\n')
}
const checks = [
  ['duration override including null', /const lifetime = next\.duration === undefined \? fallback : next\.duration/.test(read('src/hooks/use-notification-timeline.ts'))],
  ['one active and one replaceable pending notification', /queued\.current = next/.test(read('src/hooks/use-notification-timeline.ts'))],
  ['manual and timed dismissal plus callback', /const dismiss = useCallback/.test(read('src/hooks/use-notification-timeline.ts')) && /dismissHandler\.current\?\.\(dismissed\)/.test(read('src/hooks/use-notification-timeline.ts'))],
  ['timer and animation cleanup', /clearTimeout\(timer\.current\)/.test(read('src/hooks/use-notification-timeline.ts')) && /cancelAnimation\(drop\)/.test(read('src/hooks/use-notification-timeline.ts'))],
  ['system Reduce Motion and immediate transition path', /isReduceMotionEnabled/.test(read('src/components/dynamic-notifications/root.tsx')) && /if \(reduceMotion\)/.test(read('src/hooks/use-notification-timeline.ts'))],
  ['opaque Reduce Transparency card and no content blur', /reduceTransparency \? null/.test(read('src/components/dynamic-notifications/content.tsx')) && /backgroundColor: reduceTransparency \? cardColor/.test(read('src/components/dynamic-notifications/content.tsx'))],
  ['fixed blur with opacity only', /<BlurView intensity=\{36\}/.test(read('src/components/dynamic-notifications/content.tsx')) && /useAnimatedStyle/.test(read('src/hooks/use-content-blur.ts')) && !/animatedProps|useAnimatedProps|AnimatedBlurView/.test(readTree('src'))],
  ['notification accessibility announcement and dismiss action', /accessibilityRole="alert"/.test(read('src/components/dynamic-notifications/content.tsx')) && /actionName === "dismiss"/.test(read('src/components/dynamic-notifications/content.tsx'))],
  ['theme, VI/EN, dynamic type and scenario controls', /fontScale/.test(read('src/app/index.tsx')) && /"vi" \| "en"/.test(read('src/app/index.tsx')) && /reduceTransparency/.test(read('src/app/index.tsx'))],
  ['rapid-replacement demo timer cleanup', /pendingNotificationTimer/.test(read('src/app/index.tsx')) && /clearTimeout\(pendingNotificationTimer\.current\)/.test(read('src/app/index.tsx'))],
]

const failures = checks.filter(([, passed]) => !passed).map(([label]) => label)
if (failures.length) {
  for (const failure of failures) console.error(`FAIL ${failure}`)
  process.exitCode = 1
} else {
  console.log(`sandbox contract ok: ${checks.length} API/adaptation wiring checks (native interactions still require device verification)`)
}
