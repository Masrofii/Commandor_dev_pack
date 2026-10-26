'use strict';
process.env.NODE_ENV = 'test';

const { isAllowedOrigin } = require('../../src/middleware/security');

describe('CORS origin allowlist', () => {
  test('allows configured first-party origins and rejects unknown hosts', () => {
    expect(isAllowedOrigin('http://localhost:3001')).toBe(true);
    expect(isAllowedOrigin('http://localhost:3000')).toBe(true);
    expect(isAllowedOrigin(undefined)).toBe(true);

    expect(isAllowedOrigin('http://evil.example')).toBe(false);
    expect(isAllowedOrigin('https://evil.example')).toBe(false);
  });

  test('does not keep the old hardcoded IP or product-domain wildcard', () => {
    expect(isAllowedOrigin('http://74.248.38.38:3000')).toBe(false);
    expect(isAllowedOrigin('https://anything.commandor.my.id')).toBe(false);
  });
});
