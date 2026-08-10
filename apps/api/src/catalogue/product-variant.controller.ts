import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
import { CATALOGUE_PERMISSIONS } from './catalogue-permissions';
import { productIdSchema } from './product.schema';
import {
  productVariantListQuerySchema,
  productVariantLookupQuerySchema,
} from './product-variant-query.schema';
import {
  createProductVariantSchema,
  productVariantPatchSchema,
  variantIdSchema,
} from './product-variant.schema';
import { ProductVariantService } from './product-variant.service';
import {
  setVariantPriceSchema,
  variantPriceHistoryQuerySchema,
} from './variant-price.schema';

interface CatalogueHttpResponse {
  setHeader(name: string, value: string): void;
}

function setNoStore(response: CatalogueHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/merchants/:merchantId')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class ProductVariantController {
  public constructor(
    @Inject(ProductVariantService)
    private readonly service: ProductVariantService,
  ) {}

  @Get('products/:productId/variants')
  @RequirePermission(CATALOGUE_PERMISSIONS.READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('productId') productId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const parsedId = productIdSchema.safeParse(productId);
    const parsedQuery = productVariantListQuerySchema.safeParse(query);
    if (!parsedId.success || !parsedQuery.success) {
      throw new BadRequestException('Invalid Product Variant request.');
    }
    const result = await this.service.list(
      context,
      parsedId.data,
      parsedQuery.data,
    );
    setNoStore(response);
    return result;
  }

  @Post('products/:productId/variants')
  @RequirePermission(CATALOGUE_PERMISSIONS.MANAGE)
  public async create(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('productId') productId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const parsedId = productIdSchema.safeParse(productId);
    const parsedBody = createProductVariantSchema.safeParse(body);
    if (!parsedId.success || !parsedBody.success) {
      throw new BadRequestException('Invalid Product Variant request.');
    }
    const result = await this.service.create(
      context,
      parsedId.data,
      parsedBody.data,
    );
    setNoStore(response);
    return result;
  }

  @Get('products/:productId/variants/:variantId')
  @RequirePermission(CATALOGUE_PERMISSIONS.READ)
  public async detail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const ids = this.parseIds(productId, variantId);
    const result = await this.service.detail(
      context,
      ids.productId,
      ids.variantId,
    );
    setNoStore(response);
    return result;
  }

  @Patch('products/:productId/variants/:variantId')
  @RequirePermission(CATALOGUE_PERMISSIONS.MANAGE)
  public async update(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const ids = this.parseIds(productId, variantId);
    const parsedBody = productVariantPatchSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException('Invalid Product Variant request.');
    }
    const result = await this.service.update(
      context,
      ids.productId,
      ids.variantId,
      parsedBody.data,
    );
    setNoStore(response);
    return result;
  }

  @Put('products/:productId/variants/:variantId/price')
  @RequirePermission(CATALOGUE_PERMISSIONS.PRICE_MANAGE)
  public async setPrice(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const ids = this.parseIds(productId, variantId);
    const parsedBody = setVariantPriceSchema.safeParse(body);
    if (!parsedBody.success) {
      throw new BadRequestException('Invalid Variant price request.');
    }
    const result = await this.service.setPrice(
      context,
      ids.productId,
      ids.variantId,
      parsedBody.data,
    );
    setNoStore(response);
    return result;
  }

  @Get('products/:productId/variants/:variantId/price-history')
  @RequirePermission(CATALOGUE_PERMISSIONS.PRICE_MANAGE)
  public async priceHistory(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('productId') productId: string,
    @Param('variantId') variantId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const ids = this.parseIds(productId, variantId);
    const parsedQuery = variantPriceHistoryQuerySchema.safeParse(query);
    if (!parsedQuery.success) {
      throw new BadRequestException('Invalid Variant price query.');
    }
    const result = await this.service.priceHistory(
      context,
      ids.productId,
      ids.variantId,
      parsedQuery.data,
    );
    setNoStore(response);
    return result;
  }

  @Get('variants/lookup')
  @RequirePermission(CATALOGUE_PERMISSIONS.READ)
  public async lookup(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const parsed = productVariantLookupQuerySchema.safeParse(query);
    if (!parsed.success) {
      throw new BadRequestException('Invalid Product Variant lookup.');
    }
    const result = await this.service.lookup(context, parsed.data);
    setNoStore(response);
    return result;
  }

  private parseIds(productId: string, variantId: string) {
    const parsedProductId = productIdSchema.safeParse(productId);
    const parsedVariantId = variantIdSchema.safeParse(variantId);
    if (!parsedProductId.success || !parsedVariantId.success) {
      throw new BadRequestException('Invalid Product Variant request.');
    }
    return { productId: parsedProductId.data, variantId: parsedVariantId.data };
  }
}
