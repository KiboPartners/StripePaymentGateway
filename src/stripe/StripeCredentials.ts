import type { AdapterContext } from '@kibocommerce/kibo-paymentgateway-hosting'
import type { CustomAdapterSettings } from '../types'

export class StripeCredentials implements StripeCredentialsInstance {
  settings?: CustomAdapterSettings
  public secretAPIKey: string

  constructor(context: AdapterContext) {
    this.secretAPIKey = context?.settings?.find((x) => x.key === 'secretKey')?.value
  }
}
export interface StripeCredentialsInstance {
  secretAPIKey: string
}
