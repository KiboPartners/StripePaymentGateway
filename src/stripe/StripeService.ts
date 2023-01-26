import {
  CaptureRequest,
  GatewayAuthorizationRequest,
  GatewayAuthorizeResponse,
  GatewayCaptureResponse,
  GatewayCreditResponse,
  Logger,
  GatewayVoidResponse,
  ConnectionStatuses,
} from '@kibocommerce/kibo-paymentgateway-hosting'
import type { StripeCredentialsInstance } from './StripeCredentials'
import { Stripe } from 'stripe'

export class StripeService {
  credentials: StripeCredentialsInstance
  logger: Logger
  stripe: Stripe

  // Text to add to the End of every message, "Authorized via Stripe"
  RESPONSE_SUFFIX = ' via Stripe'
  constructor(credentials: StripeCredentialsInstance, logger: Logger) {
    this.credentials = credentials
    this.logger = logger
    this.stripe = new Stripe(this.credentials.secretAPIKey, { apiVersion: '2020-08-27' })
  }

  /**
   * We want to log things that are useful for debugging. Previously some of the other gateways have been
   * silent out of fear of logging too much. We do need some info so we can track down issues when they
   * do occur, although being careful to log only single fields.
   *
   * @param request The Request from the gateway
   * @param fields Any custom fields
   */
  logAll(
    request: GatewayAuthorizationRequest,
    fields: Record<string, string | boolean | number | null | undefined>
  ) {
    this.logger.info(
      JSON.stringify(
        Object.assign(
          {
            txn: request.context?.transaction?.id,
            orderNumber: request.context?.transaction?.kiboTransactionId,
            method: request.methodName,
            amount: request.amount,
          },
          Object.assign(fields, {
            first: request.shopper?.contact?.firstname,
            last: request.shopper?.contact?.lastname,
            customerId: request.shopper?.customerId,
            country: request.shopper?.contact?.country,
            currency: request.shopper?.currencyCode,
            sandbox: request.context?.isSandbox,
          })
        )
      )
    )
  }

  /**
   * We want to log things that are useful for debugging. Previously some of the other gateways have been
   * silent out of fear of logging too much. We do need some info so we can track down issues when they
   * do occur, although being careful to log only single fields.
   *
   * @param request The Request from the gateway
   * @param fields Any custom fields
   */
  log(
    request: GatewayAuthorizationRequest,
    fields: Record<string, string | boolean | number | null | undefined>
  ) {
    this.logger.info(
      JSON.stringify(
        Object.assign(
          {
            txn: request.context?.transaction?.id,
            orderNumber: request.context?.transaction?.kiboTransactionId,
          },
          fields
        )
      )
    )
  }

  stripeApiError(
    req: GatewayAuthorizationRequest,
    stripeErr: Stripe.errors.StripeError,
    kibo_error: string
  ): GatewayAuthorizeResponse {
    const additional_data = {
      code: stripeErr?.code,
      decline_code: stripeErr?.decline_code,
      message: stripeErr?.message,
      name: stripeErr?.name,
      status_code: stripeErr.statusCode?.toString(),
      type: stripeErr.type.toString(),
      requestId: stripeErr.requestId,
      kibo_error: kibo_error,
    }
    const responseData = Object.entries(additional_data).map((e) => {
      return { key: e[0], value: e[1] }
    })

    switch (stripeErr.type) {
      case 'StripeCardError':
        return {
          isDeclined: true,
          responseText: stripeErr.message,
          responseCode: stripeErr.code,
          remoteConnectionStatus: ConnectionStatuses.Reject,
          responseData: responseData,
          transactionId: stripeErr.requestId,
        }
      case 'StripeInvalidRequestError':
      case 'StripeAPIError':
      case 'StripeConnectionError':
      case 'StripeAuthenticationError':
      case 'StripeRateLimitError':
      case 'StripePermissionError':
      case 'StripeIdempotencyError':
      case 'StripeInvalidGrantError':
    }
    return {
      isDeclined: true,
      responseText: 'Stripe API Error: ' + stripeErr.message,
      responseCode: stripeErr.code,
      remoteConnectionStatus: ConnectionStatuses.Error,
      responseData: responseData,
      transactionId: stripeErr.requestId,
    }
  }

  async authorize(request: GatewayAuthorizationRequest): Promise<GatewayAuthorizeResponse> {
    const paymentOrderNumber = request?.context?.transaction?.kiboTransactionId
    const customDataStripeCustomerId = request?.data?.stripe_customer_id
    const customDataPaymentIntentId = request?.data?.payment_intent_id
    const customDataPaymentMethodId = request?.data?.payment_method_id
    const customDataParentOrderId = request?.data?.parentOrderId

    // We know that we have a continuity (subscription) order when the kiboTransactionId (Kibo Order Number)
    // is different than the parentOrderId added as custom data on the order
    let isContinuityOrder = false
    if (
      customDataParentOrderId &&
      paymentOrderNumber &&
      paymentOrderNumber != customDataParentOrderId
    ) {
      isContinuityOrder = true
    }

    this.logAll(request, {
      customDataPaymentMethodId,
      customDataStripeCustomerId,
      customDataParentOrderId,
      paymentOrderNumber,
      isContinuityOrder,
      customDataPaymentIntentId,
    })

    let paymentIntentId: string
    let paymentIntentConfirm: Stripe.PaymentIntent
    if (customDataPaymentIntentId && !isContinuityOrder) {
      try {
        paymentIntentConfirm = await this.stripe.paymentIntents.confirm(customDataPaymentIntentId)
        paymentIntentId = paymentIntentConfirm.id
        this.log(request, {
          message: 'ContinuityOrder false so using payment intent',
          paymentIntentConfirm_id: paymentIntentId,
        })
      } catch (err) {
        const error = err as Stripe.errors.StripeError
        return this.stripeApiError(request, error, 'authorize_01')
      }
    } else {
      this.log(request, {
        message: 'ContinuityOrder not false',
      })
      let paymentMethodId: string
      if (customDataPaymentMethodId) {
        paymentMethodId = customDataPaymentMethodId
        this.log(request, {
          message: 'CustomDataPaymentMethodId exists, using that for paymentMethodId',
          paymentMethodId: paymentMethodId
        })
      } else {
        try {
          const paymentMethodObj = await this.stripe.paymentMethods.create({
            type: 'card',
            card: {
              number: request?.card?.cardIssueNumber,
              exp_month: request?.card?.expireMonth,
              exp_year: request?.card?.expireYear,
              cvc: request?.card?.cvv,
            },
            billing_details: {
              address: {
                city: request?.shopper?.address?.city,
                country: request?.shopper?.address?.country,
                line1: request?.shopper?.address?.line1,
                line2: request?.shopper?.address?.line2,
                postal_code: request?.shopper?.address?.postalCode,
                state: request?.shopper?.address?.state,
              },
              email: request?.shopper?.contact?.email,
              name: request?.shopper?.contact?.firstname,
              phone: request?.shopper?.phoneNumber,
            },
          } as Stripe.PaymentMethodCreateParams)
          paymentMethodId = paymentMethodObj?.id
          this.log(request, {
            message: 'Created a new Payment Method with id: ' + paymentMethodId
          })
        } catch (err) {
          const error = err as Stripe.errors.StripeError
          return this.stripeApiError(request, error, 'authorize_02')
        }
      }

      try {
        paymentIntentConfirm = await this.stripe.paymentIntents.create({
          amount: this.toStripeAmount(request.amount),
          currency: request.shopper?.currencyCode || 'USD',
          capture_method: 'manual',
          confirm: true,
          customer: customDataStripeCustomerId,
          payment_method: paymentMethodId,
          payment_method_types: ['card'],
          off_session: isContinuityOrder ? true : undefined,
        })
      } catch (err) {
        const error = err as Stripe.errors.StripeError
        return this.stripeApiError(request, error, 'authorize_03')
      }
      paymentIntentId = paymentIntentConfirm.id
    }

    if (!paymentIntentId) {
      return {
        isDeclined: true,
        responseText: 'Error, Missing paymentIntentId',
        responseCode: '500',
        remoteConnectionStatus: ConnectionStatuses.Error,
      }
    }

    let chargeId
    let status
    if (paymentIntentConfirm?.status === 'requires_capture') {
      status = paymentIntentConfirm?.charges?.data[0]?.status
      chargeId = paymentIntentConfirm?.charges?.data[0]?.id
      this.log(request, { paymentIntentId, chargeId, status })
      if (chargeId && status === 'succeeded') {
        return {
          responseData: [{ key: 'payment_intent_id', value: paymentIntentId }],
          transactionId: paymentIntentConfirm?.id,
          isDeclined: false,
          responseText: 'Authorized' + this.RESPONSE_SUFFIX,
          responseCode: '200',
          remoteConnectionStatus: ConnectionStatuses.Success,
        }
      }
    }

    return {
      responseData: [{ key: 'client_secret', value: paymentIntentConfirm?.client_secret }],
      transactionId: paymentIntentId,
      isDeclined: true,
      responseText: paymentIntentConfirm?.status,
      responseCode: '500',
      remoteConnectionStatus: ConnectionStatuses.Error,
    }
  }

  //Capture Call
  async capture(request: CaptureRequest): Promise<GatewayCaptureResponse> {
    const gatewayInteractions = request?.context?.transaction?.gatewayInteractions
    const paymentIntentId = gatewayInteractions
      ?.find((interaction) => interaction.isSuccessful)
      ?.responseData?.find((x) => x.key === 'payment_intent_id')?.value

    this.logAll(request, {
      paymentIntentId,
    })

    if (!paymentIntentId) {
      return {
        responseData: [],
        transactionId: paymentIntentId,
        isDeclined: true,
        responseText: 'No paymentIntentId found on payment, cannot capture',
        responseCode: '500',
        remoteConnectionStatus: ConnectionStatuses.Error,
      }
    }

    try {
      const paymentIntentCapture = await this.stripe.paymentIntents.capture(paymentIntentId, {
        amount_to_capture: this.toStripeAmount(request.amount),
      })
      return this.mapCaptureResponse(paymentIntentCapture)
    } catch (err) {
      const error = err as Stripe.errors.StripeError
      return this.stripeApiError(request, error, 'capture_01')
    }
  }

  async authorizeAndCapture(request: CaptureRequest): Promise<GatewayCaptureResponse> {
    const authorizeResponse = await this.authorize(request)
    if (authorizeResponse.isDeclined) {
      return authorizeResponse
    } else {
      return await this.capture(request)
    }
  }

  async void(request: CaptureRequest): Promise<GatewayVoidResponse> {
    this.logAll(request, {})
    const gatewayInteractions = request?.context?.transaction?.gatewayInteractions
    const paymentIntentId = gatewayInteractions
      ?.find((interaction) => interaction.isSuccessful)
      ?.responseData?.find((x) => x.key === 'payment_intent_id')?.value
    this.log(request, { paymentIntentId })
    if (!paymentIntentId) {
      this.log(request, { message: 'missing paymentIntentId' })
      return {
        isDeclined: true,
        responseText: 'Error: missing mayentIntentId' + this.RESPONSE_SUFFIX,
        responseCode: '500',
      }
    }
    try {
      const response = await this.stripe.paymentIntents.cancel(paymentIntentId)
      if (response?.status === 'canceled') {
        return {
          responseData: [
            { key: 'payment_intent_id', value: response?.id },
            { key: 'client_secret', value: response?.client_secret },
          ],
          transactionId: response?.id,
          isDeclined: false,
          responseText: response?.status + this.RESPONSE_SUFFIX,
          responseCode: '200',
        }
      }

      return {
        transactionId: response?.id,
        isDeclined: true,
        responseText: response?.status + this.RESPONSE_SUFFIX,
        responseCode: '500',
      }
    } catch (err) {
      const error = err as Stripe.errors.StripeError
      return this.stripeApiError(request, error, 'void_01')
    }
  }

  async credit(request: CaptureRequest): Promise<GatewayCreditResponse> {
    this.logAll(request, {})

    const gatewayInteractions = request?.context?.transaction?.gatewayInteractions
    const paymentChargeId = gatewayInteractions
      ?.find((interaction) => interaction.isSuccessful &&
        (interaction.transactionType == 'Capture' || interaction.transactionType == 'AuthorizeAndCapture'))
      ?.responseData?.find((x) => x.key === 'payment_charge_id')?.value

    this.log(request, { paymentChargeId })

    if (!paymentChargeId) {
      return {
        isDeclined: true,
        responseText: 'Error, missing paymentChargeId',
        responseCode: '500',
      }
    }
    //modify the request for partial refund
    try {
      const response = await this.stripe.refunds.create({
        charge: paymentChargeId,
        amount: this.toStripeAmount(request.amount),
      })

      if (response?.status === 'succeeded') {
        return {
          responseData: [
            { key: 'payment_charge_id', value: response?.charge },
            { key: 'payment_refund_id', value: response?.id },
            { key: 'payment_intent_id', value: response?.payment_intent },
          ],
          transactionId: response?.id,
          isDeclined: false,
          responseText: response?.status,
          responseCode: '200',
        }
      }

      return {
        transactionId: response?.id,
        isDeclined: true,
        responseText: response?.status,
        responseCode: '500',
      }
    } catch (err) {
      const error = err as Stripe.errors.StripeError
      return this.stripeApiError(request, error, 'credit_01')
    }
  }

  toStripeAmount(amount: number | undefined): number {
    return Number(((amount || 0) * 100).toFixed(2))
  }

  // Generate Capture Response
  mapCaptureResponse(response: Stripe.PaymentIntent): GatewayCaptureResponse {
    let chargeId
    let status
    if (response?.status === 'succeeded' && response?.charges?.data !== undefined) {
      let chargesData = null
      chargesData = response?.charges?.data
      for (const data of chargesData) {
        status = data?.status
        chargeId = data?.id
      }
    }
    if (chargeId && status === 'succeeded') {
      return {
        responseData: [
          { key: 'payment_charge_id', value: chargeId },
          { key: 'payment_intent_id', value: response?.id },
        ],
        transactionId: chargeId,
        isDeclined: false,
        responseText: response?.status + this.RESPONSE_SUFFIX,
        responseCode: '200',
      }
    }

    return {
      transactionId: response?.id,
      isDeclined: true,
      responseText: response?.status,
      responseCode: '500',
    }
  }
}
