import type { WaitingAssets, WaitingKind } from './waiting.types'
export const waitingAssets: Record<WaitingKind, WaitingAssets> = {
  'customer-confirmation': {
    hero: require('../../../../assets/worker-waiting/confirmation-mascot.png'),
    footer: require('../../../../assets/worker-waiting/confirmation-footer.png'),
  },
  'scope-approval': {
    hero: require('../../../../assets/worker-waiting/approval-document.png'),
    footer: require('../../../../assets/worker-waiting/approval-footer.png'),
  },
}

// The same art cut out of its white haze, for the dark theme's black canvas.
export const waitingDarkAssets: Record<WaitingKind, WaitingAssets> = {
  'customer-confirmation': {
    hero: require('../../../../assets/worker-waiting/confirmation-mascot-dark.png'),
    footer: require('../../../../assets/worker-waiting/confirmation-footer-dark.png'),
  },
  'scope-approval': {
    hero: require('../../../../assets/worker-waiting/approval-document-dark.png'),
    footer: require('../../../../assets/worker-waiting/approval-footer-dark.png'),
  },
}
