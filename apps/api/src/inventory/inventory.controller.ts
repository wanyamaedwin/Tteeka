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

  private parseVariantId(variantId: string): string {
    const parsed = variantIdSchema.safeParse(variantId);
    if (!parsed.success) throw new BadRequestException('Invalid Variant id.');
    return parsed.data;
  }
}
