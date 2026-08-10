import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { CATALOGUE_STORE } from './catalogue.store';
import { PrismaCatalogueStore } from './prisma-catalogue.store';
import { ProductController } from './product.controller';
import { ProductService } from './product.service';

const catalogueStoreProvider: Provider = {
  provide: CATALOGUE_STORE,
  useClass: PrismaCatalogueStore,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [ProductController],
  providers: [catalogueStoreProvider, ProductService],
})
export class CatalogueModule {}
