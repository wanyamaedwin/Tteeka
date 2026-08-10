import { SetMetadata } from '@nestjs/common';

export const REQUIRED_PERMISSION_METADATA = Symbol(
  'tteeka.required-permission',
);

export function RequirePermission(
  permissionKey: string,
): ClassDecorator & MethodDecorator {
  if (permissionKey.trim().length === 0) {
    throw new TypeError('Required permission key must be non-empty.');
  }

  return SetMetadata(REQUIRED_PERMISSION_METADATA, permissionKey);
}
