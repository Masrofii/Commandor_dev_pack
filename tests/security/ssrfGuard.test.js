'use strict';
process.env.NODE_ENV = 'test';
process.env.ENCRYPTION_KEY = 'test-encryption-key-0123456789';
process.env.ALLOW_PRIVATE_OUTBOUND = 'false';

const {
  isPrivateAddress,
  isBlockedHostname,
  assertSafeOutboundUrl,
  isSafeOutboundUrl
} = require('../../src/utils/ssrfGuard');

describe('SSRF guard', () => {
  test('detects private, loopback, link-local and metadata IPv4 ranges', () => {
    expect(isPrivateAddress('127.0.0.1')).toBe(true);
    expect(isPrivateAddress('10.10.10.10')).toBe(true);
    expect(isPrivateAddress('172.16.0.1')).toBe(true);
    expect(isPrivateAddress('192.168.1.1')).toBe(true);
    expect(isPrivateAddress('169.254.169.254')).toBe(true);
    expect(isPrivateAddress('100.64.0.1')).toBe(true);
    expect(isPrivateAddress('0.0.0.0')).toBe(true);
    expect(isPrivateAddress('224.0.0.1')).toBe(true);
  });

  test('treats public IPv4 and IPv6 addresses as safe', () => {
    expect(isPrivateAddress('8.8.8.8')).toBe(false);
    expect(isPrivateAddress('1.1.1.1')).toBe(false);
    expect(isPrivateAddress('2001:4860:4860::8888')).toBe(false);
  });

  test('detects private IPv6 addresses and invalid values', () => {
    expect(isPrivateAddress('::1')).toBe(true);
    expect(isPrivateAddress('::')).toBe(true);
    expect(isPrivateAddress('fd00::1')).toBe(true);
    expect(isPrivateAddress('fe80::1')).toBe(true);
    expect(isPrivateAddress('::ffff:127.0.0.1')).toBe(true);
    expect(isPrivateAddress('::ffff:7f00:1')).toBe(true);
    expect(isPrivateAddress('fec0::1')).toBe(true);
    expect(isPrivateAddress('2002:7f00:1::')).toBe(true);
    expect(isPrivateAddress('2001:0:0:0:0:0:8000:1')).toBe(true);
    expect(isPrivateAddress('not-an-ip')).toBe(true);
    expect(isPrivateAddress('')).toBe(true);
  });

  test('blocks metadata and internal hostnames but allows public hostnames', () => {
    expect(isBlockedHostname('localhost')).toBe(true);
    expect(isBlockedHostname('LOCALHOST.')).toBe(true);
    expect(isBlockedHostname('api.localhost')).toBe(true);
    expect(isBlockedHostname('service.internal')).toBe(true);
    expect(isBlockedHostname('printer.local')).toBe(true);
    expect(isBlockedHostname('metadata.google.internal')).toBe(true);
    expect(isBlockedHostname('2130706433')).toBe(true);
    expect(isBlockedHostname('0x7f000001')).toBe(true);
    expect(isBlockedHostname('example.com')).toBe(false);
  });

  test('rejects malformed URLs, unsupported protocols and embedded credentials', async () => {
    await expect(assertSafeOutboundUrl('not a url')).rejects.toThrow(/valid absolute URL/i);
    await expect(assertSafeOutboundUrl('ftp://example.com/file')).rejects.toThrow(/http:\/\/ or https:\/\//i);
    await expect(assertSafeOutboundUrl('http://user:pass@example.com')).rejects.toThrow(/embedded credentials/i);
    await expect(assertSafeOutboundUrl('http://localhost:3000')).rejects.toThrow(/blocked host/i);
    await expect(assertSafeOutboundUrl('http://service.internal')).rejects.toThrow(/blocked host/i);
  });

  test('rejects URLs that resolve to loopback, private or metadata addresses', async () => {
    await expect(assertSafeOutboundUrl('http://127.0.0.1:8080')).rejects.toThrow(/private or loopback/i);
    await expect(assertSafeOutboundUrl('http://169.254.169.254/latest/meta-data')).rejects.toThrow(/private or loopback/i);
    await expect(assertSafeOutboundUrl('http://10.0.0.5')).rejects.toThrow(/private or loopback/i);
    await expect(assertSafeOutboundUrl('http://[::1]:8080')).rejects.toThrow(/private or loopback/i);
  });

  test('permits explicit loopback access for deliberate internal routing checks', async () => {
    const result = await assertSafeOutboundUrl('http://127.0.0.1:8080/health', { allowLoopback: true });
    expect(result.url.hostname).toBe('127.0.0.1');
    expect(result.addresses.length).toBeGreaterThan(0);
  });

  test('returns false rather than throwing through isSafeOutboundUrl', async () => {
    await expect(isSafeOutboundUrl('http://127.0.0.1')).resolves.toBe(false);
    await expect(isSafeOutboundUrl('http://127.0.0.1', { allowLoopback: true })).resolves.toBe(true);
  });
});
