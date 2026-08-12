import { Inject, Injectable } from '@nestjs/common';

import { INVENTORY_STORE, type InventoryStore } from './inventory.store';

@Injectable()
export class StockHoldExpiryService {
  public constructor(
    @Inject(INVENTORY_STORE) private readonly store: InventoryStore,
  ) {}

  public expireDue(now = new Date(), batchSize = 100): Promise<number> {
    if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 1000) {
      throw new RangeError('Expiry batch size must be between 1 and 1000.');
    }
    return this.store.expireDueStockHolds(now, batchSize);
  }
}
