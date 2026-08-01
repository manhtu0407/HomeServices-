import type {
  CustomerAccountDeletionInput,
  CustomerAccountDeletionResponse,
} from './api-types'
import { api } from './api'

export const customerAccountService = {
  deleteAccount(input: CustomerAccountDeletionInput, accessToken: string) {
    return api.postAuthenticated<CustomerAccountDeletionResponse>(
      '/me/account-deletion',
      input,
      accessToken,
    )
  },
}
