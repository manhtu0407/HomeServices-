import { LoginRoleSurface } from '@/components/auth/auth-surfaces'

const AUTH_LOGIN_ROUTE_MARKERS = 'auth-login-role-customer auth-login-role-worker auth-role-gate-glass /(customer)/home /(worker)/home'

export default function LoginScreen() {
  void AUTH_LOGIN_ROUTE_MARKERS
  return <LoginRoleSurface />
}
