import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
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
import { CATALOGUE_PERMISSIONS } from './catalogue-permissions';
import { productListQuerySchema } from './product-query.schema';
import {
  createProductSchema,
  productIdSchema,
  productPatchSchema,
} from './product.schema';
import { ProductService } from './product.service';

interface CatalogueHttpResponse {
  setHeader(name: string, value: string): void;
}

function setNoStore(response: CatalogueHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/merchants/:merchantId/products')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class ProductController {
  public constructor(
    @Inject(ProductService) private readonly productService: ProductService,
  ) {}

  @Get()
  @RequirePermission(CATALOGUE_PERMISSIONS.READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const parsed = productListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException('Invalid Product query.');
    const result = await this.productService.list(context, parsed.data);
    setNoStore(response);
    return result;
  }

  @Post()
  @RequirePermission(CATALOGUE_PERMISSIONS.MANAGE)
  public async create(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const parsed = createProductSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Invalid Product request.');
    const result = await this.productService.create(context, parsed.data);
    setNoStore(response);
    return result;
  }

  @Get(':productId')
  @RequirePermission(CATALOGUE_PERMISSIONS.READ)
  public async detail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('productId') productId: string,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const parsed = productIdSchema.safeParse(productId);
    if (!parsed.success)
      throw new BadRequestException('Invalid Product request.');
    const result = await this.productService.detail(context, parsed.data);
    setNoStore(response);
    return result;
  }

  @Patch(':productId')
  @RequirePermission(CATALOGUE_PERMISSIONS.MANAGE)
  public async update(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('productId') productId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CatalogueHttpResponse,
  ) {
    const parsedId = productIdSchema.safeParse(productId);
    const parsedBody = productPatchSchema.safeParse(body);
    if (!parsedId.success || !parsedBody.success) {
      throw new BadRequestException('Invalid Product request.');
    }
    const result = await this.productService.update(
      context,
      parsedId.data,
      parsedBody.data,
    );
    setNoStore(response);
    return result;
  }
}
