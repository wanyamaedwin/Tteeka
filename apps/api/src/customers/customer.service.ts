import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';

import type { ResolvedMerchantContext } from '../authorization/merchant-context';
import type { CustomerListQuery } from './customer-query.schema';
import type { CreateCustomerInput, CustomerPatch } from './customer.schema';
import {
  CUSTOMER_STORE,
  type CustomerRecord,
  type CustomerStore,
  CustomerPhoneAlreadyExistsError,
  type DeliveryLocationRecord,
} from './customer.store';
import type { DeliveryLocationListQuery } from './delivery-location-query.schema';
import type {
  CreateDeliveryLocationInput,
  DeliveryLocationPatch,
} from './delivery-location.schema';

@Injectable()
export class CustomerService {
  public constructor(
    @Inject(CUSTOMER_STORE) private readonly store: CustomerStore,
  ) {}

  public async create(
    context: ResolvedMerchantContext,
    input: CreateCustomerInput,
  ) {
    try {
      return this.mapCustomer(
        await this.store.createCustomer(context.merchant.id, input),
      );
    } catch (error: unknown) {
      this.mapCustomerConflict(error);
    }
  }

  public async list(
    context: ResolvedMerchantContext,
    query: CustomerListQuery,
  ) {
    const result = await this.store.listCustomers(context.merchant.id, query);
    return {
      customers: result.rows.map((row) => this.mapCustomer(row)),
      pagination: this.pagination(query, result.total),
    };
  }

  public async detail(context: ResolvedMerchantContext, customerId: string) {
    const customer = await this.store.findCustomer(
      context.merchant.id,
      customerId,
    );
    if (customer === null) throw new NotFoundException('Not found.');
    return this.mapCustomer(customer);
  }

  public async update(
    context: ResolvedMerchantContext,
    customerId: string,
    patch: CustomerPatch,
  ) {
    try {
      const customer = await this.store.updateCustomer(
        context.merchant.id,
        customerId,
        patch,
      );
      if (customer === null) throw new NotFoundException('Not found.');
      return this.mapCustomer(customer);
    } catch (error: unknown) {
      this.mapCustomerConflict(error);
    }
  }

  public async createLocation(
    context: ResolvedMerchantContext,
    customerId: string,
    input: CreateDeliveryLocationInput,
  ) {
    const location = await this.store.createDeliveryLocation(
      context.merchant.id,
      customerId,
      input,
    );
    if (location === null) throw new NotFoundException('Not found.');
    return this.mapLocation(location);
  }

  public async listLocations(
    context: ResolvedMerchantContext,
    customerId: string,
    query: DeliveryLocationListQuery,
  ) {
    const result = await this.store.listDeliveryLocations(
      context.merchant.id,
      customerId,
      query,
    );
    if (result === null) throw new NotFoundException('Not found.');
    return {
      deliveryLocations: result.rows.map((row) => this.mapLocation(row)),
      pagination: this.pagination(query, result.total),
    };
  }

  public async locationDetail(
    context: ResolvedMerchantContext,
    customerId: string,
    locationId: string,
  ) {
    const location = await this.store.findDeliveryLocation(
      context.merchant.id,
      customerId,
      locationId,
    );
    if (location === null) throw new NotFoundException('Not found.');
    return this.mapLocation(location);
  }

  public async updateLocation(
    context: ResolvedMerchantContext,
    customerId: string,
    locationId: string,
    patch: DeliveryLocationPatch,
  ) {
    const location = await this.store.updateDeliveryLocation(
      context.merchant.id,
      customerId,
      locationId,
      patch,
    );
    if (location === null) throw new NotFoundException('Not found.');
    return this.mapLocation(location);
  }

  private mapCustomer(record: CustomerRecord) {
    return {
      id: record.id,
      merchantId: record.merchantId,
      name: record.name,
      phone: record.phone,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapLocation(record: DeliveryLocationRecord) {
    return {
      id: record.id,
      merchantId: record.merchantId,
      customerId: record.customerId,
      area: record.area,
      landmark: record.landmark,
      phone: record.phone,
      instructions: record.instructions,
      mapPinUrl: record.mapPinUrl,
      status: record.status,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  private mapCustomerConflict(error: unknown): never {
    if (error instanceof CustomerPhoneAlreadyExistsError) {
      throw new ConflictException('A customer with this phone already exists.');
    }
    throw error;
  }

  private pagination(
    query: { readonly page: number; readonly pageSize: number },
    total: number,
  ) {
    return {
      page: query.page,
      pageSize: query.pageSize,
      total,
      totalPages: Math.ceil(total / query.pageSize),
    };
  }
}
