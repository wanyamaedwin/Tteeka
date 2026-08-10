import { Module, type Provider } from '@nestjs/common';

import { AuthModule } from '../auth/auth.module';
import { AuthorizationModule } from '../authorization/authorization.module';
import { ACCESS_MANAGEMENT_STORE } from './access-management.store';
import { PermissionCatalogController } from './permission-catalog.controller';
import { PermissionCatalogService } from './permission-catalog.service';
import { PrismaAccessManagementStore } from './prisma-access-management.store';
import { RoleController } from './role.controller';
import { RoleService } from './role.service';
import { StaffController } from './staff.controller';
import { StaffService } from './staff.service';

const accessManagementStoreProvider: Provider = {
  provide: ACCESS_MANAGEMENT_STORE,
  useClass: PrismaAccessManagementStore,
};

@Module({
  imports: [AuthModule, AuthorizationModule],
  controllers: [StaffController, RoleController, PermissionCatalogController],
  providers: [
    accessManagementStoreProvider,
    StaffService,
    RoleService,
    PermissionCatalogService,
  ],
})
export class AccessManagementModule {}
