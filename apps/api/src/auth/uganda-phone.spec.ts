import assert from 'node:assert/strict';
import test from 'node:test';

import { normalizeUgandaPhone } from './uganda-phone';

for (const input of [
  '+256772123456',
  '256772123456',
  '0772123456',
  '+256 772 123 456',
  '0772-123-456',
  '(0772) 123 456',
] as const) {
  void test(`normalizes supported Uganda phone form ${input}`, () => {
    assert.equal(normalizeUgandaPhone(input), '+256772123456');
  });
}

for (const input of [
  '',
  '772123456',
  '+255772123456',
  '+25677212345',
  '+2567721234567',
  '+256abc123456',
  '+256 772.123.456',
] as const) {
  void test(`rejects malformed phone form ${input || '<empty>'}`, () => {
    assert.equal(normalizeUgandaPhone(input), null);
  });
}
