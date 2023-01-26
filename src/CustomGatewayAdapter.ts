import {
  AdapterContext,
  PaymentGatwayAdapter,
  CaptureRequest,
  CreditRequest,
  GatewayAuthorizationRequest,
  GatewayAuthorizeResponse,
  GatewayCaptureResponse,
  GatewayCreditResponse,
  GatewayDebitResponse,
  GatewayGetGiftCardBalanceRequest,
  GatewayGetGiftCardBalanceResponse,
  GatewayGiftCardCreateRequest,
  GatewayGiftCardCreateResponse,
  GatewayVoidResponse,
  Logger,
  AuthorizeIdKeyNameResponse,
  GatewayInteraction,
  ValidateResponse,
  ConnectionStatuses,
} from '@kibocommerce/kibo-paymentgateway-hosting'
import { StripeService } from './stripe/StripeService'

export class CustomGatewayAdapter implements PaymentGatwayAdapter {
  context: AdapterContext
  logger: Logger
  service: StripeService
  constructor(context: AdapterContext, logger: Logger, service: StripeService) {
    this.context = context
    this.logger = logger
    this.service = service
  }
  async authorize(request: GatewayAuthorizationRequest): Promise<GatewayAuthorizeResponse> {
    return await this.service.authorize(request)
  }
  async authorizeWithToken(
    request: GatewayAuthorizationRequest
  ): Promise<GatewayAuthorizeResponse> {
    request.data
    throw new Error('Method not implemented.')
  }
  async capture(request: CaptureRequest): Promise<GatewayCaptureResponse> {
    return await this.service.capture(request)
  }
  async credit(request: CreditRequest): Promise<GatewayCreditResponse> {
    return await this.service.credit(request)
  }
  async void(request: CaptureRequest): Promise<GatewayVoidResponse> {
    return await this.service.void(request)
  }
  async authorizeAndCapture(request: GatewayAuthorizationRequest): Promise<GatewayDebitResponse> {
    return await this.service.authorizeAndCapture(request)
  }
  async authorizeAndCaptureWithToken(
    request: GatewayAuthorizationRequest
  ): Promise<GatewayDebitResponse> {
    this.logger.info('authorizeAndCaptureWithToken : ', request?.apiVersion)
    throw new Error('Method not implemented.')
  }
  async createGiftCard(
    request: GatewayGiftCardCreateResponse
  ): Promise<GatewayGiftCardCreateRequest> {
    this.logger.info('createGiftCard : ', request?.transactionId)
    throw new Error('Method not implemented.')
  }
  async getBalance(
    request: GatewayGetGiftCardBalanceRequest
  ): Promise<GatewayGetGiftCardBalanceResponse> {
    this.logger.info('getBalance : ', request?.apiVersion)
    throw new Error('Method not implemented.')
  }
  async validateAuthTransaction(request: GatewayInteraction): Promise<ValidateResponse> {
    return {
      isDeclined: false,
      remoteConnectionStatus: ConnectionStatuses.Success,
      isValid: true,
      responseText: 'OK',
    }
  }
  async getAuthorizationIDKeyName(): Promise<AuthorizeIdKeyNameResponse> {
    throw new Error('Method not implemented.')
  }
}
