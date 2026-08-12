import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
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
import { variantIdSchema } from '../catalogue/product-variant.schema';
import { inventoryLedgerQuerySchema } from './inventory-ledger-query.schema';
import {
  idempotencyKeySchema,
  inventoryMovementSchema,
} from './inventory-movement.schema';
import { INVENTORY_PERMISSIONS } from './inventory-permissions';
import { inventoryListQuerySchema } from './inventory-query.schema';
import { InventoryService } from './inventory.service';
import { stockHoldListQuerySchema } from './stock-hold-query.schema';
import {
  createStockHoldSchema,
  holdIdSchema,
  updateStockHoldExpirySchema,
} from './stock-hold.schema';

interface InventoryHttpResponse {
  setHeader(name: string, value: string): void;
}

function setNoStore(response: InventoryHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/merchants/:merchantId/inventory')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class InventoryController {
  public constructor(
    @Inject(InventoryService) private readonly service: InventoryService,
  ) {}

  @Get()
  @RequirePermission(INVENTORY_PERMISSIONS.READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const parsed = inventoryListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException('Invalid inventory query.');
    const result = await this.service.list(context, parsed.data);
    setNoStore(response);
    return result;
  }

  @Get(':variantId')
  @RequirePermission(INVENTORY_PERMISSIONS.READ)
  public async detail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('variantId') variantId: string,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const parsed = this.parseVariantId(variantId);
    const result = await this.service.detail(context, parsed);
    setNoStore(response);
    return result;
  }

  @Get(':variantId/ledger')
  @RequirePermission(INVENTORY_PERMISSIONS.READ)
  public async ledger(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('variantId') variantId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const parsedId = this.parseVariantId(variantId);
    const parsedQuery = inventoryLedgerQuerySchema.safeParse(query);
    if (!parsedQuery.success) {
      throw new BadRequestException('Invalid inventory ledger query.');
    }
    const result = await this.service.ledger(
      context,
      parsedId,
      parsedQuery.data,
    );
    setNoStore(response);
    return result;
  }

  @Post(':variantId/movements')
  @HttpCode(200)
  @RequirePermission(INVENTORY_PERMISSIONS.MANAGE)
  public async movement(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('variantId') variantId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const parsedId = this.parseVariantId(variantId);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    const parsedBody = inventoryMovementSchema.safeParse(body);
    if (!parsedKey.success || !parsedBody.success) {
      throw new BadRequestException('Invalid inventory movement request.');
    }
    const result = await this.service.applyMovement(
      context,
      parsedId,
      parsedBody.data,
      parsedKey.data,
    );
    setNoStore(response);
    return result;
  }

  @Get(':variantId/holds')
  @RequirePermission(INVENTORY_PERMISSIONS.READ)
  public async holds(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('variantId') variantId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const parsedId = this.parseVariantId(variantId);
    const parsedQuery = stockHoldListQuerySchema.safeParse(query);
    if (!parsedQuery.success) {
      throw new BadRequestException('Invalid stock hold query.');
    }
    const result = await this.service.listHolds(
      context,
      parsedId,
      parsedQuery.data,
    );
    setNoStore(response);
    return result;
  }

  @Post(':variantId/holds')
  @HttpCode(200)
  @RequirePermission(INVENTORY_PERMISSIONS.MANAGE)
  public async createHold(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('variantId') variantId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const parsedId = this.parseVariantId(variantId);
    const parsedKey = idempotencyKeySchema.safeParse(idempotencyKey);
    const parsedBody = createStockHoldSchema.safeParse(body);
    if (!parsedKey.success || !parsedBody.success) {
      throw new BadRequestException('Invalid stock hold request.');
    }
    const result = await this.service.createHold(
      context,
      parsedId,
      parsedBody.data,
      parsedKey.data,
    );
    setNoStore(response);
    return result;
  }

  @Get(':variantId/holds/:holdId')
  @RequirePermission(INVENTORY_PERMISSIONS.READ)
  public async holdDetail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('variantId') variantId: string,
    @Param('holdId') holdId: string,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const result = await this.service.holdDetail(
      context,
      this.parseVariantId(variantId),
      this.parseHoldId(holdId),
    );
    setNoStore(response);
    return result;
  }

  @Put(':variantId/holds/:holdId/expiry')
  @RequirePermission(INVENTORY_PERMISSIONS.MANAGE)
  public async updateHoldExpiry(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('variantId') variantId: string,
    @Param('holdId') holdId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const parsedBody = updateStockHoldExpirySchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException('Invalid stock hold expiry request.');
    }
    const result = await this.service.updateHoldExpiry(
      context,
      this.parseVariantId(variantId),
      this.parseHoldId(holdId),
      parsedBody.data,
    );
    setNoStore(response);
    return result;
  }

  @Post(':variantId/holds/:holdId/release')
  @HttpCode(200)
  @RequirePermission(INVENTORY_PERMISSIONS.MANAGE)
  public async releaseHold(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('variantId') variantId: string,
    @Param('holdId') holdId: string,
    @Res({ passthrough: true }) response: InventoryHttpResponse,
  ) {
    const result = await this.service.releaseHold(
      context,
      this.parseVariantId(variantId),
      this.parseHoldId(holdId),
    );
    setNoStore(response);
    return result;
  }

  private parseVariantId(variantId: string): string {
    const parsed = variantIdSchema.safeParse(variantId);
    if (!parsed.success) throw new BadRequestException('Invalid Variant id.');
    return parsed.data;
  }

  private parseHoldId(holdId: string): string {
    const parsed = holdIdSchema.safeParse(holdId);
    if (!parsed.success) throw new BadRequestException('Invalid Hold id.');
    return parsed.data;
  }
}
