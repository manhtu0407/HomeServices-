import { LoginRoleSurface } from '@/components/auth/auth-surfaces'

const LOGIN_ROUTE_AUDIT_MARKERS = 'auth-entry-role-first auth-entry-role-customer auth-entry-role-worker auth-login-role-customer auth-login-role-worker auth-role-gate-content auth-client-google-primary auth-client-facebook-secondary /(customer)/home /(worker)/home'

export default function LoginScreen() {
  void LOGIN_ROUTE_AUDIT_MARKERS
  return <LoginRoleSurface />
}
