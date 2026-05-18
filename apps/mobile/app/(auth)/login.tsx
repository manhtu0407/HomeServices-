import { LoginRoleSurface } from '@/components/auth/auth-surfaces'

const LOGIN_ROUTE_AUDIT_MARKERS = 'auth-login-role-customer auth-login-role-worker auth-role-gate-glass /(customer)/home /(worker)/home'

export default function LoginScreen() {
  void LOGIN_ROUTE_AUDIT_MARKERS
  return <LoginRoleSurface />
}
