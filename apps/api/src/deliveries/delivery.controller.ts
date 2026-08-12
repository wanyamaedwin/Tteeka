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
import { DELIVERY_PERMISSIONS } from './delivery-permissions';
import {
  deliveryAttemptListQuerySchema,
  deliveryListQuerySchema,
} from './delivery-query.schema';
import {
  createDeliverySchema,
  deliveryIdempotencyKeySchema,
  deliveryIdSchema,
  recordDeliveryAttemptSchema,
} from './delivery.schema';
import { DeliveryService } from './delivery.service';

interface DeliveryHttpResponse {
  setHeader(name: string, value: string): void;
}

function noStore(response: DeliveryHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/merchants/:merchantId/deliveries')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class DeliveryController {
  public constructor(
    @Inject(DeliveryService) private readonly service: DeliveryService,
  ) {}

  @Get()
  @RequirePermission(DELIVERY_PERMISSIONS.READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: DeliveryHttpResponse,
  ) {
    const parsed = deliveryListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException('Invalid Delivery query.');
    }
    const result = await this.service.list(context, parsed.data);
    noStore(response);
    return result;
  }

  @Post()
  @RequirePermission(DELIVERY_PERMISSIONS.MANAGE)
  public async create(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: DeliveryHttpResponse,
  ) {
    const parsedKey = deliveryIdempotencyKeySchema.safeParse(key);
    const parsed = createDeliverySchema.safeParse(body);
    if (!parsedKey.success || !parsed.success) {
      throw new BadRequestException('Invalid Delivery creation request.');
    }
    const result = await this.service.create(
      context,
      parsed.data,
      parsedKey.data,
    );
    noStore(response);
    return result;
  }

  @Get(':deliveryId')
  @RequirePermission(DELIVERY_PERMISSIONS.READ)
  public async detail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('deliveryId') deliveryId: string,
    @Res({ passthrough: true }) response: DeliveryHttpResponse,
  ) {
    const result = await this.service.detail(context, this.parseId(deliveryId));
    noStore(response);
    return result;
  }

  @Post(':deliveryId/ready')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(DELIVERY_PERMISSIONS.MANAGE)
  public ready(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('deliveryId') deliveryId: string,
    @Res({ passthrough: true }) response: DeliveryHttpResponse,
  ) {
    return this.transition(context, deliveryId, 'READY', response);
  }

  @Post(':deliveryId/dispatch')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(DELIVERY_PERMISSIONS.MANAGE)
  public dispatch(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('deliveryId') deliveryId: string,
    @Res({ passthrough: true }) response: DeliveryHttpResponse,
  ) {
    return this.transition(context, deliveryId, 'DISPATCHED', response);
  }

  @Post(':deliveryId/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission(DELIVERY_PERMISSIONS.MANAGE)
  public cancel(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('deliveryId') deliveryId: string,
    @Res({ passthrough: true }) response: DeliveryHttpResponse,
  ) {
    return this.transition(context, deliveryId, 'CANCELLED', response);
  }

  @Get(':deliveryId/attempts')
  @RequirePermission(DELIVERY_PERMISSIONS.READ)
  public async attempts(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('deliveryId') deliveryId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: DeliveryHttpResponse,
  ) {
    const parsed = deliveryAttemptListQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException('Invalid Delivery Attempt query.');
    }
    const result = await this.service.attempts(
      context,
      this.parseId(deliveryId),
      parsed.data,
    );
    noStore(response);
    return result;
  }

  @Post(':deliveryId/attempts')
  @RequirePermission(DELIVERY_PERMISSIONS.MANAGE)
  public async recordAttempt(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('deliveryId') deliveryId: string,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: DeliveryHttpResponse,
  ) {
    const parsedKey = deliveryIdempotencyKeySchema.safeParse(key);
    const parsed = recordDeliveryAttemptSchema.safeParse(body);
    if (!parsedKey.success || !parsed.success) {
      throw new BadRequestException('Invalid Delivery Attempt request.');
    }
    const result = await this.service.recordAttempt(
      context,
      this.parseId(deliveryId),
      parsed.data,
      parsedKey.data,
    );
    noStore(response);
    return result;
  }

  private async transition(
    context: ResolvedMerchantContext,
    deliveryId: string,
    target: 'READY' | 'DISPATCHED' | 'CANCELLED',
    response: DeliveryHttpResponse,
  ) {
    const result = await this.service.transition(
      context,
      this.parseId(deliveryId),
      target,
    );
    noStore(response);
    return result;
  }

  private parseId(value: string): string {
    const parsed = deliveryIdSchema.safeParse(value);
    if (!parsed.success) throw new BadRequestException('Invalid deliveryId.');
    return parsed.data;
  }
}
