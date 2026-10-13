const EXPLICIT_ONLY = Object.freeze(['emil-pick-ui-library', 'emil-prototype'])

function has(text, pattern) {
  return pattern.test(text)
}

export function routeUpstreamDesignSkills({ task = '', surface = '', workflow = '', stack = 'react-native', designClass = '' } = {}) {
  const text = `${task} ${surface} ${workflow} ${designClass}`.toLowerCase()
  const runtime = String(stack).toLowerCase().replaceAll('_', '-')
  const selected = new Set()
  const dynamicNotification = has(text, /dynamic\s*(?:island|notification)|in-app notification/)
  const motion = has(text, /motion|animation|transition|gesture|spring|haptic|sheet|shimmer|skeleton/)
  const review = has(text, /review|audit|polish|critique|improve|refactor|jank|stutter|frame\s*drop/)
  const opportunities = has(text, /opportunit|where .* animate|responsiveness|feedback moment/)
  const stress = has(text, /stress.?test|edge.?case|break the ui|robustness pass/)
  const vocabulary = has(text, /what (?:is|do you call)|name (?:this|that) motion|animation vocabulary/)
  const apple = has(text, /apple|ios|iphone|haptic|safe area|native interaction|liquid glass/)

  const isExpoRuntime = runtime === 'react-native' || runtime === 'expo' || runtime === 'rn'
  if (dynamicNotification && isExpoRuntime) selected.add('kael-dynamic-notifications')
  if (isExpoRuntime) {
    if (motion) selected.add('emil-animate-expo')
    if (review) selected.add('emil-review-animations')
    if (has(text, /improv|audit|polish/)) selected.add('emil-improve-animations')
    if (opportunities) selected.add('emil-find-animation-opportunities')
    if (vocabulary) selected.add('emil-animation-vocabulary')
    if (apple) selected.add('emil-apple-design')
    if (stress) selected.add('emil-break-ui')
    if (has(text, /design eng|design review|design polish|interaction polish/) || (review && has(text, /design|ui|interface/))) selected.add('emil-design-eng')
  } else if (runtime === 'web' || runtime === 'react' || runtime === 'react-dom') {
    if (motion) selected.add('emil-animate')
    if (review) selected.add('emil-review-animations')
    if (has(text, /improv|audit|polish/)) selected.add('emil-improve-animations')
    if (opportunities) selected.add('emil-find-animation-opportunities')
    if (vocabulary) selected.add('emil-animation-vocabulary')
    if (has(text, /performance|jank|stutter|frame\s*drop/)) selected.add('emil-animation-performance')
    if (has(text, /sonner|toast/)) selected.add('emil-ask-sonner')
    if (has(text, /mobile browser|pwa|touch target|safe area/)) selected.add('emil-mobile-native')
    if (stress) selected.add('emil-break-ui')
  } else if (runtime === 'swift' || runtime === 'swiftui' || runtime === 'ios-swift') {
    selected.add('emil-write-swift')
    if (apple) selected.add('emil-apple-design')
    if (review) selected.add('emil-review-animations')
  }

  return { selected: [...selected], explicitOnly: [...EXPLICIT_ONLY], runtime: runtime || 'react-native' }
}

export { EXPLICIT_ONLY as EXPLICIT_ONLY_UPSTREAM_SKILLS }
