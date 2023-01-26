import {
  AdapterFactory,
  AdapterContext,
  PaymentGatwayAdapter,
  Logger,
} from '@kibocommerce/kibo-paymentgateway-hosting'
import { CustomGatewayAdapter } from './CustomGatewayAdapter'
import type { CustomAdapterSettings } from './types'
import { StripeService } from './stripe/StripeService'
import { StripeCredentials } from './stripe/StripeCredentials'
export class CustomAdapterFactory implements AdapterFactory<CustomAdapterSettings> {
  settings?: CustomAdapterSettings
  constructor(settings?: CustomAdapterSettings) {
    this.settings = settings
  }
  createAdapter(context: AdapterContext, logger: Logger): PaymentGatwayAdapter {
    const credentials = new StripeCredentials(context)
    console.log("Credentials created")

    const service = new StripeService(credentials, logger)
    return new CustomGatewayAdapter(context, logger, service)
  }
}
