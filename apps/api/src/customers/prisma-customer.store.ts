import { Inject, Injectable } from '@nestjs/common';

import { DatabaseService } from '../database/database.service';
import type { CustomerListQuery } from './customer-query.schema';
import type { CreateCustomerInput, CustomerPatch } from './customer.schema';
import {
  type CustomerListResult,
  type CustomerRecord,
  type CustomerStore,
  CustomerPhoneAlreadyExistsError,
  type DeliveryLocationListResult,
  type DeliveryLocationRecord,
} from './customer.store';
import type { DeliveryLocationListQuery } from './delivery-location-query.schema';
import type {
  CreateDeliveryLocationInput,
  DeliveryLocationPatch,
} from './delivery-location.schema';

const customerSelect = {
  id: true,
  merchantId: true,
  name: true,
  phone: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

const locationSelect = {
  id: true,
  merchantId: true,
  customerId: true,
  area: true,
  landmark: true,
  phone: true,
  instructions: true,
  mapPinUrl: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} as const;

function isCustomerPhoneConflict(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'P2002' &&
    (!('meta' in error) ||
      JSON.stringify(error.meta).toLowerCase().includes('phone'))
  );
}

@Injectable()
export class PrismaCustomerStore implements CustomerStore {
  public constructor(
    @Inject(DatabaseService) private readonly database: DatabaseService,
  ) {}

  public async createCustomer(
    merchantId: string,
    input: CreateCustomerInput,
  ): Promise<CustomerRecord> {
    try {
      return await this.database.client.customer.create({
        data: {
          merchantId,
          phone: input.phone,
          ...(input.name === undefined ? {} : { name: input.name }),
        },
        select: customerSelect,
      });
    } catch (error: unknown) {
      if (isCustomerPhoneConflict(error)) {
        throw new CustomerPhoneAlreadyExistsError();
      }
      throw error;
    }
  }

  public async listCustomers(
    merchantId: string,
    query: CustomerListQuery,
  ): Promise<CustomerListResult> {
    const where = {
      merchantId,
      ...(query.status === undefined ? {} : { status: query.status }),
      ...(query.phone === undefined ? {} : { phone: query.phone }),
      ...(query.q === undefined
        ? {}
        : {
            OR: [
              { name: { contains: query.q, mode: 'insensitive' as const } },
              { phone: { contains: query.q } },
            ],
          }),
    };
    const [total, rows] = await this.database.client.$transaction([
      this.database.client.customer.count({ where }),
      this.database.client.customer.findMany({
        where,
        select: customerSelect,
        orderBy: [
          { name: { sort: 'asc', nulls: 'last' } },
          { phone: 'asc' },
          { id: 'asc' },
        ],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { rows, total };
  }

  public findCustomer(
    merchantId: string,
    customerId: string,
  ): Promise<CustomerRecord | null> {
    return this.database.client.customer.findFirst({
      where: { merchantId, id: customerId },
      select: customerSelect,
    });
  }

  public async updateCustomer(
    merchantId: string,
    customerId: string,
    patch: CustomerPatch,
  ): Promise<CustomerRecord | null> {
    try {
      const result = await this.database.client.customer.updateMany({
        where: { merchantId, id: customerId },
        data: {
          ...(patch.phone === undefined ? {} : { phone: patch.phone }),
          ...(patch.name === undefined ? {} : { name: patch.name }),
          ...(patch.status === undefined ? {} : { status: patch.status }),
        },
      });
      if (result.count === 0) return null;
      return this.findCustomer(merchantId, customerId);
    } catch (error: unknown) {
      if (isCustomerPhoneConflict(error)) {
        throw new CustomerPhoneAlreadyExistsError();
      }
      throw error;
    }
  }

  public createDeliveryLocation(
    merchantId: string,
    customerId: string,
    input: CreateDeliveryLocationInput,
  ): Promise<DeliveryLocationRecord | null> {
    return this.database.client.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { merchantId_id: { merchantId, id: customerId } },
        select: { id: true },
      });
      if (customer === null) return null;
      return transaction.deliveryLocation.create({
        data: {
          merchantId,
          customerId,
          area: input.area,
          landmark: input.landmark,
          phone: input.phone,
          ...(input.instructions === undefined
            ? {}
            : { instructions: input.instructions }),
          ...(input.mapPinUrl === undefined
            ? {}
            : { mapPinUrl: input.mapPinUrl }),
        },
        select: locationSelect,
      });
    });
  }

  public listDeliveryLocations(
    merchantId: string,
    customerId: string,
    query: DeliveryLocationListQuery,
  ): Promise<DeliveryLocationListResult | null> {
    return this.database.client.$transaction(async (transaction) => {
      const customer = await transaction.customer.findUnique({
        where: { merchantId_id: { merchantId, id: customerId } },
        select: { id: true },
      });
      if (customer === null) return null;
      const where = {
        merchantId,
        customerId,
        ...(query.status === undefined ? {} : { status: query.status }),
      };
      const [total, rows] = await Promise.all([
        transaction.deliveryLocation.count({ where }),
        transaction.deliveryLocation.findMany({
          where,
          select: locationSelect,
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.pageSize,
          take: query.pageSize,
        }),
      ]);
      return { rows, total };
    });
  }

  public findDeliveryLocation(
    merchantId: string,
    customerId: string,
    locationId: string,
  ): Promise<DeliveryLocationRecord | null> {
    return this.database.client.deliveryLocation.findFirst({
      where: { merchantId, customerId, id: locationId },
      select: locationSelect,
    });
  }

  public async updateDeliveryLocation(
    merchantId: string,
    customerId: string,
    locationId: string,
    patch: DeliveryLocationPatch,
  ): Promise<DeliveryLocationRecord | null> {
    const result = await this.database.client.deliveryLocation.updateMany({
      where: { merchantId, customerId, id: locationId },
      data: {
        ...(patch.area === undefined ? {} : { area: patch.area }),
        ...(patch.landmark === undefined ? {} : { landmark: patch.landmark }),
        ...(patch.phone === undefined ? {} : { phone: patch.phone }),
        ...(patch.instructions === undefined
          ? {}
          : { instructions: patch.instructions }),
        ...(patch.mapPinUrl === undefined
          ? {}
          : { mapPinUrl: patch.mapPinUrl }),
        ...(patch.status === undefined ? {} : { status: patch.status }),
      },
    });
    if (result.count === 0) return null;
    return this.findDeliveryLocation(merchantId, customerId, locationId);
  }
}
