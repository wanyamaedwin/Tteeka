import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Inject,
  Param,
  Patch,
  Post,
  Put,
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
import { replaceOrderItemsSchema } from './order-items.schema';
import { ORDER_PERMISSIONS } from './order-permissions';
import { orderListQuerySchema } from './order-query.schema';
import {
  createOrderSchema,
  orderIdempotencyKeySchema,
  orderIdSchema,
  orderPatchSchema,
} from './order.schema';
import { OrderService } from './order.service';

interface OrderHttpResponse {
  setHeader(name: string, value: string): void;
}

function noStore(response: OrderHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/merchants/:merchantId/orders')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class OrderController {
  public constructor(
    @Inject(OrderService) private readonly service: OrderService,
  ) {}

  @Get()
  @RequirePermission(ORDER_PERMISSIONS.READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: OrderHttpResponse,
  ) {
    const parsed = orderListQuerySchema.safeParse(query);
    if (!parsed.success) throw new BadRequestException('Invalid Order query.');
    const result = await this.service.list(context, parsed.data);
    noStore(response);
    return result;
  }

  @Post()
  @RequirePermission(ORDER_PERMISSIONS.MANAGE)
  public async create(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Headers('idempotency-key') key: unknown,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: OrderHttpResponse,
  ) {
    const parsedKey = orderIdempotencyKeySchema.safeParse(key);
    const parsed = createOrderSchema.safeParse(body);
    if (!parsedKey.success || !parsed.success)
      throw new BadRequestException('Invalid Order creation request.');
    const result = await this.service.create(
      context,
      parsed.data,
      parsedKey.data,
    );
    noStore(response);
    return result;
  }

  @Get(':orderId')
  @RequirePermission(ORDER_PERMISSIONS.READ)
  public async detail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Res({ passthrough: true }) response: OrderHttpResponse,
  ) {
    const result = await this.service.detail(context, this.parseId(orderId));
    noStore(response);
    return result;
  }

  @Patch(':orderId')
  @RequirePermission(ORDER_PERMISSIONS.MANAGE)
  public async patch(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: OrderHttpResponse,
  ) {
    const parsed = orderPatchSchema.safeParse(body);
    if (!parsed.success) throw new BadRequestException('Invalid Order patch.');
    const result = await this.service.patch(
      context,
      this.parseId(orderId),
      parsed.data,
    );
    noStore(response);
    return result;
  }

  @Put(':orderId/items')
  @RequirePermission(ORDER_PERMISSIONS.MANAGE)
  public async replaceItems(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: OrderHttpResponse,
  ) {
    const parsed = replaceOrderItemsSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Invalid Order item request.');
    const result = await this.service.replaceItems(
      context,
      this.parseId(orderId),
      parsed.data,
    );
    noStore(response);
    return result;
  }

  @Post(':orderId/abandon')
  @RequirePermission(ORDER_PERMISSIONS.MANAGE)
  public async abandon(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Res({ passthrough: true }) response: OrderHttpResponse,
  ) {
    const result = await this.service.transition(
      context,
      this.parseId(orderId),
      'ABANDONED',
    );
    noStore(response);
    return result;
  }

  @Post(':orderId/cancel')
  @RequirePermission(ORDER_PERMISSIONS.MANAGE)
  public async cancel(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Res({ passthrough: true }) response: OrderHttpResponse,
  ) {
    const result = await this.service.transition(
      context,
      this.parseId(orderId),
      'CANCELLED',
    );
    noStore(response);
    return result;
  }

  @Get(':orderId/items')
  @RequirePermission(ORDER_PERMISSIONS.READ)
  public async items(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('orderId') orderId: string,
    @Res({ passthrough: true }) response: OrderHttpResponse,
  ) {
    const result = await this.service.items(context, this.parseId(orderId));
    noStore(response);
    return result;
  }

  private parseId(orderId: string): string {
    const parsed = orderIdSchema.safeParse(orderId);
    if (!parsed.success) throw new BadRequestException('Invalid orderId.');
    return parsed.data;
  }
}
