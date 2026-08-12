import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';

import { SessionAuthGuard } from '../auth/session-auth.guard';
import { CurrentMerchantContext } from '../authorization/current-merchant-context.decorator';
import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import { MerchantContextGuard } from '../authorization/merchant-context.guard';
import { PermissionGuard } from '../authorization/permission.guard';
import { RequirePermission } from '../authorization/require-permission.decorator';
import { orderIdSchema } from '../orders/order.schema';
import { PAYMENT_PERMISSIONS } from './payment-permissions';
import { paymentListQuerySchema } from './payment-query.schema';
import { ProviderVerificationService } from './provider-verification.service';
import {
  providerVerificationBodySchema,
  verificationAttemptListQuerySchema,
} from './provider-verification.schema';
import {
  paymentIdempotencyKeySchema,
  paymentIdSchema,
  reportPaymentSchema,
} from './payment.schema';
import { PaymentService } from './payment.service';

interface PaymentHttpResponse {
  setHeader(name: string, value: string): void;
}

function noStore(response: PaymentHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/merchants/:merchantId/orders/:orderId')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class PaymentController {
  public constructor(
    @Inject(PaymentService) private readonly service: PaymentService,
    @Inject(ProviderVerificationService)
    private readonly providerVerification: ProviderVerificationService,
  ) {}

  @Get('payments')
  @RequirePermission(PAYMENT_PERMISSIONS.READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    const parsedQuery = paymentListQuerySchema.safeParse(query);
    if (!parsedQuery.success)
      throw new BadRequestException('Invalid Payment query.');
    const result = await this.service.list(
      context,
      this.parseOrderId(orderId),
      parsedQuery.data,
    );
    noStore(response);
    return result;
  }

  @Post('payments')
  @RequirePermission(PAYMENT_PERMISSIONS.MANAGE)
  public async report(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    const parsedKey = paymentIdempotencyKeySchema.safeParse(key);
    const parsedBody = reportPaymentSchema.safeParse(body);
    if (!parsedKey.success || !parsedBody.success) {
      throw new BadRequestException('Invalid Payment report.');
    }
    const result = await this.service.report(
      context,
      this.parseOrderId(orderId),
      parsedBody.data,
      parsedKey.data,
    );
    noStore(response);
    return result;
  }

  @Get('payments/:paymentId')
  @RequirePermission(PAYMENT_PERMISSIONS.READ)
  public async detail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    const result = await this.service.detail(
      context,
      this.parseOrderId(orderId),
      this.parsePaymentId(paymentId),
    );
    noStore(response);
    return result;
  }

  @Post('payments/:paymentId/verification-pending')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PAYMENT_PERMISSIONS.MANAGE)
  public transitionPending(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    return this.transition(
      context,
      orderId,
      paymentId,
      'VERIFICATION_PENDING',
      response,
    );
  }

  @Post('payments/:paymentId/verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PAYMENT_PERMISSIONS.MANAGE)
  public verify(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    return this.transition(context, orderId, paymentId, 'VERIFIED', response);
  }

  @Post('payments/:paymentId/reject')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PAYMENT_PERMISSIONS.MANAGE)
  public reject(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    return this.transition(context, orderId, paymentId, 'REJECTED', response);
  }

  @Post('payments/:paymentId/provider-verify')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(PAYMENT_PERMISSIONS.MANAGE)
  public async providerVerify(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    const parsedKey = paymentIdempotencyKeySchema.safeParse(key);
    const parsedBody = providerVerificationBodySchema.safeParse(body);
    if (!parsedKey.success || !parsedBody.success) {
      throw new BadRequestException('Invalid provider verification request.');
    }
    const result = await this.providerVerification.verify(
      context,
      this.parseOrderId(orderId),
      this.parsePaymentId(paymentId),
      parsedKey.data,
    );
    noStore(response);
    return result;
  }

  @Get('payments/:paymentId/verification-attempts')
  @RequirePermission(PAYMENT_PERMISSIONS.READ)
  public async verificationAttempts(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Param('paymentId') paymentId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    const parsedQuery = verificationAttemptListQuerySchema.safeParse(query);
    if (!parsedQuery.success) {
      throw new BadRequestException('Invalid verification attempt query.');
    }
    const result = await this.providerVerification.list(
      context,
      this.parseOrderId(orderId),
      this.parsePaymentId(paymentId),
      parsedQuery.data,
    );
    noStore(response);
    return result;
  }

  @Get('payment-summary')
  @RequirePermission(PAYMENT_PERMISSIONS.READ)
  public async summary(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Res({ passthrough: true }) response: PaymentHttpResponse,
  ) {
    const result = await this.service.summary(
      context,
      this.parseOrderId(orderId),
    );
    noStore(response);
    return result;
  }

  private async transition(
    context: ResolvedMerchantContext,
    orderId: string,
    paymentId: string,
    target: 'VERIFICATION_PENDING' | 'VERIFIED' | 'REJECTED',
    response: PaymentHttpResponse,
  ) {
    const result = await this.service.transition(
      context,
      this.parseOrderId(orderId),
      this.parsePaymentId(paymentId),
      target,
    );
    noStore(response);
    return result;
  }

  private parseOrderId(value: string): string {
    const parsed = orderIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Invalid orderId.');
    return parsed.data;
  }

  private parsePaymentId(value: string): string {
    const parsed = paymentIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Invalid paymentId.');
    return parsed.data;
  }
}
