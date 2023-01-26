import { StripeService } from '../src/stripe/StripeService'
import { StripeCredentials } from '../src/stripe/StripeCredentials'
import { Logger } from '@kibocommerce/kibo-paymentgateway-hosting'
export const mockServcieFactory = (logger: Logger) => {
  const credentials = new StripeCredentials({})

  return new StripeService(credentials, logger)
}
