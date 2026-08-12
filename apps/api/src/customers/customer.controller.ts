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
import { customerListQuerySchema } from './customer-query.schema';
import { CUSTOMER_PERMISSIONS } from './customer-permissions';
import {
  createCustomerSchema,
  customerIdSchema,
  customerPatchSchema,
} from './customer.schema';
import { CustomerService } from './customer.service';
import { deliveryLocationListQuerySchema } from './delivery-location-query.schema';
import {
  createDeliveryLocationSchema,
  deliveryLocationIdSchema,
  deliveryLocationPatchSchema,
} from './delivery-location.schema';

interface CustomerHttpResponse {
  setHeader(name: string, value: string): void;
}

function setNoStore(response: CustomerHttpResponse): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
}

@Controller('api/v1/merchants/:merchantId/customers')
@UseGuards(SessionAuthGuard, MerchantContextGuard, PermissionGuard)
export class CustomerController {
  public constructor(
    @Inject(CustomerService) private readonly service: CustomerService,
  ) {}

  @Get()
  @RequirePermission(CUSTOMER_PERMISSIONS.READ)
  public async list(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CustomerHttpResponse,
  ) {
    const parsed = customerListQuerySchema.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException('Invalid Customer query.');
    const result = await this.service.list(context, parsed.data);
    setNoStore(response);
    return result;
  }

  @Post()
  @RequirePermission(CUSTOMER_PERMISSIONS.MANAGE)
  public async create(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CustomerHttpResponse,
  ) {
    const parsed = createCustomerSchema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException('Invalid Customer request.');
    const result = await this.service.create(context, parsed.data);
    setNoStore(response);
    return result;
  }

  @Get(':customerId')
  @RequirePermission(CUSTOMER_PERMISSIONS.READ)
  public async detail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('customerId') customerId: string,
    @Res({ passthrough: true }) response: CustomerHttpResponse,
  ) {
    const result = await this.service.detail(
      context,
      this.parseCustomerId(customerId),
    );
    setNoStore(response);
    return result;
  }

  @Patch(':customerId')
  @RequirePermission(CUSTOMER_PERMISSIONS.MANAGE)
  public async update(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('customerId') customerId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CustomerHttpResponse,
  ) {
    const parsedBody = customerPatchSchema.safeParse(body);
    if (!parsedBody.success)
      throw new BadRequestException('Invalid Customer request.');
    const result = await this.service.update(
      context,
      this.parseCustomerId(customerId),
      parsedBody.data,
    );
    setNoStore(response);
    return result;
  }

  @Get(':customerId/delivery-locations')
  @RequirePermission(CUSTOMER_PERMISSIONS.READ)
  public async listLocations(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('customerId') customerId: string,
    @Query() query: unknown,
    @Res({ passthrough: true }) response: CustomerHttpResponse,
  ) {
    const parsedQuery = deliveryLocationListQuerySchema.safeParse(query);
    if (!parsedQuery.success)
      throw new BadRequestException('Invalid DeliveryLocation query.');
    const result = await this.service.listLocations(
      context,
      this.parseCustomerId(customerId),
      parsedQuery.data,
    );
    setNoStore(response);
    return result;
  }

  @Post(':customerId/delivery-locations')
  @RequirePermission(CUSTOMER_PERMISSIONS.MANAGE)
  public async createLocation(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('customerId') customerId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CustomerHttpResponse,
  ) {
    const parsedBody = createDeliveryLocationSchema.safeParse(body);
    if (!parsedBody.success)
      throw new BadRequestException('Invalid DeliveryLocation request.');
    const result = await this.service.createLocation(
      context,
      this.parseCustomerId(customerId),
      parsedBody.data,
    );
    setNoStore(response);
    return result;
  }

  @Get(':customerId/delivery-locations/:locationId')
  @RequirePermission(CUSTOMER_PERMISSIONS.READ)
  public async locationDetail(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('customerId') customerId: string,
    @Param('locationId') locationId: string,
    @Res({ passthrough: true }) response: CustomerHttpResponse,
  ) {
    const result = await this.service.locationDetail(
      context,
      this.parseCustomerId(customerId),
      this.parseLocationId(locationId),
    );
    setNoStore(response);
    return result;
  }

  @Patch(':customerId/delivery-locations/:locationId')
  @RequirePermission(CUSTOMER_PERMISSIONS.MANAGE)
  public async updateLocation(
    @CurrentMerchantContext() context: ResolvedMerchantContext,
    @Param('customerId') customerId: string,
    @Param('locationId') locationId: string,
    @Body() body: unknown,
    @Res({ passthrough: true }) response: CustomerHttpResponse,
  ) {
    const parsedBody = deliveryLocationPatchSchema.safeParse(body);
    if (!parsedBody.success)
      throw new BadRequestException('Invalid DeliveryLocation request.');
    const result = await this.service.updateLocation(
      context,
      this.parseCustomerId(customerId),
      this.parseLocationId(locationId),
      parsedBody.data,
    );
    setNoStore(response);
    return result;
  }

  private parseCustomerId(customerId: string): string {
    const parsed = customerIdSchema.safeParse(customerId);
    if (!parsed.success)
      throw new BadRequestException('Invalid Customer request.');
    return parsed.data;
  }

  private parseLocationId(locationId: string): string {
    const parsed = deliveryLocationIdSchema.safeParse(locationId);
    if (!parsed.success)
      throw new BadRequestException('Invalid DeliveryLocation request.');
    return parsed.data;
  }
}
