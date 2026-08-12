import type { CustomerListQuery } from './customer-query.schema';
import type { CreateCustomerInput, CustomerPatch } from './customer.schema';
import type { DeliveryLocationListQuery } from './delivery-location-query.schema';
import type {
  CreateDeliveryLocationInput,
  DeliveryLocationPatch,
} from './delivery-location.schema';

export const CUSTOMER_STORE = Symbol('CUSTOMER_STORE');

export type CustomerStatus = 'ACTIVE' | 'ARCHIVED';
export type DeliveryLocationStatus = 'ACTIVE' | 'ARCHIVED';

export interface CustomerRecord {
  readonly id: string;
  readonly merchantId: string;
  readonly name: string | null;
  readonly phone: string;
  readonly status: CustomerStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface DeliveryLocationRecord {
  readonly id: string;
  readonly merchantId: string;
  readonly customerId: string;
  readonly area: string;
  readonly landmark: string;
  readonly phone: string;
  readonly instructions: string | null;
  readonly mapPinUrl: string | null;
  readonly status: DeliveryLocationStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface CustomerListResult {
  readonly rows: readonly CustomerRecord[];
  readonly total: number;
}

export interface DeliveryLocationListResult {
  readonly rows: readonly DeliveryLocationRecord[];
  readonly total: number;
}

export class CustomerPhoneAlreadyExistsError extends Error {
  public constructor() {
    super('A customer with this phone already exists.');
    this.name = 'CustomerPhoneAlreadyExistsError';
  }
}

export interface CustomerStore {
  createCustomer(
    merchantId: string,
    input: CreateCustomerInput,
  ): Promise<CustomerRecord>;
  listCustomers(
    merchantId: string,
    query: CustomerListQuery,
  ): Promise<CustomerListResult>;
  findCustomer(
    merchantId: string,
    customerId: string,
  ): Promise<CustomerRecord | null>;
  updateCustomer(
    merchantId: string,
    customerId: string,
    patch: CustomerPatch,
  ): Promise<CustomerRecord | null>;
  createDeliveryLocation(
    merchantId: string,
    customerId: string,
    input: CreateDeliveryLocationInput,
  ): Promise<DeliveryLocationRecord | null>;
  listDeliveryLocations(
    merchantId: string,
    customerId: string,
    query: DeliveryLocationListQuery,
  ): Promise<DeliveryLocationListResult | null>;
  findDeliveryLocation(
    merchantId: string,
    customerId: string,
    locationId: string,
  ): Promise<DeliveryLocationRecord | null>;
  updateDeliveryLocation(
    merchantId: string,
    customerId: string,
    locationId: string,
    patch: DeliveryLocationPatch,
  ): Promise<DeliveryLocationRecord | null>;
}
