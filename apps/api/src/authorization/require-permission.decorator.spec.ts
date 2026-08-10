import assert from 'node:assert/strict';
import test from 'node:test';

import { Reflector } from '@nestjs/core';
import 'reflect-metadata';

import {
  REQUIRED_PERMISSION_METADATA,
  RequirePermission,
} from './require-permission.decorator';

@RequirePermission('test.class.read')
class ClassProtectedController {
  public classOnly(this: void): boolean {
    return true;
  }

  @RequirePermission('Test.Method.Read')
  public methodOverride(this: void): boolean {
    return true;
  }

  @RequirePermission(' test.internal spacing ')
  public preservedWhitespace(this: void): boolean {
    return true;
  }
}

void test('RequirePermission stores exact method metadata without normalization', () => {
  assert.equal(
    Reflect.getMetadata(
      REQUIRED_PERMISSION_METADATA,
      ClassProtectedController.prototype.methodOverride,
    ),
    'Test.Method.Read',
  );
  assert.equal(
    Reflect.getMetadata(
      REQUIRED_PERMISSION_METADATA,
      ClassProtectedController.prototype.preservedWhitespace,
    ),
    ' test.internal spacing ',
  );
});

void test('RequirePermission stores retrievable class metadata', () => {
  assert.equal(
    Reflect.getMetadata(REQUIRED_PERMISSION_METADATA, ClassProtectedController),
    'test.class.read',
  );
});

void test('method metadata overrides class metadata through Reflector', () => {
  const reflector = new Reflector();
  assert.equal(
    reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_METADATA, [
      ClassProtectedController.prototype.methodOverride,
      ClassProtectedController,
    ]),
    'Test.Method.Read',
  );
  assert.equal(
    reflector.getAllAndOverride<string>(REQUIRED_PERMISSION_METADATA, [
      ClassProtectedController.prototype.classOnly,
      ClassProtectedController,
    ]),
    'test.class.read',
  );
});

for (const permissionKey of ['', ' ', '\t\r\n']) {
  void test(`RequirePermission rejects empty declaration ${JSON.stringify(permissionKey)}`, () => {
    assert.throws(() => RequirePermission(permissionKey), {
      name: 'TypeError',
      message: 'Required permission key must be non-empty.',
    });
  });
}
