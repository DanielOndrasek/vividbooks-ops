import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { isIpInAnyCidr, isIpInCidr } from '../src/utils/cidr.ts';

test('IPv4 match v rámci /24', () => {
  assert.equal(isIpInCidr('10.0.0.42', '10.0.0.0/24'), true);
  assert.equal(isIpInCidr('10.0.1.1', '10.0.0.0/24'), false);
});

test('IPv4 přesný match /32', () => {
  assert.equal(isIpInCidr('1.2.3.4', '1.2.3.4/32'), true);
  assert.equal(isIpInCidr('1.2.3.5', '1.2.3.4/32'), false);
});

test('IPv4 catch-all /0', () => {
  assert.equal(isIpInCidr('8.8.8.8', '0.0.0.0/0'), true);
});

test('IPv4 odmítne neplatný vstup', () => {
  assert.equal(isIpInCidr('not-an-ip', '10.0.0.0/24'), false);
  assert.equal(isIpInCidr('256.0.0.1', '10.0.0.0/24'), false);
});

test('IPv6 match v /64', () => {
  assert.equal(isIpInCidr('2a09:8280::1', '2a09:8280::/64'), true);
  assert.equal(isIpInCidr('2a09:8281::1', '2a09:8280::/64'), false);
});

test('isIpInAnyCidr funguje pro pole', () => {
  assert.equal(isIpInAnyCidr('10.0.0.1', ['1.2.3.0/24', '10.0.0.0/24']), true);
  assert.equal(isIpInAnyCidr('192.168.1.1', ['1.2.3.0/24', '10.0.0.0/24']), false);
});
