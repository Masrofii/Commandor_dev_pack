'use strict';
const dns = require('dns').promises;
const net = require('net');
const config = require('../../config/config');

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'localhost.localdomain',
  'metadata',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',
  'kubernetes.default',
  'kubernetes.default.svc'
]);

const PRIVATE_V4 = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.0.2.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4]
];

function ipv4ToInt(ip) {
  const parts = ip.split('.').map((part) => parseInt(part, 10));
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isPrivateIpv4(ip) {
  const value = ipv4ToInt(ip);
  if (value === null) return false;
  return PRIVATE_V4.some(([range, bits]) => {
    const rangeValue = ipv4ToInt(range);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (rangeValue & mask);
  });
}

function ipv4FromGroups(high, low) {
  return `${(high >> 8) & 0xff}.${high & 0xff}.${(low >> 8) & 0xff}.${low & 0xff}`;
}

function parseIpv6Groups(ip) {
  let normalized = String(ip).toLowerCase().split('%')[0];
  if (!normalized.includes(':')) return null;

  // Expand an embedded dotted-quad IPv4 suffix (for example ::ffff:127.0.0.1).
  if (normalized.includes('.')) {
    const lastColon = normalized.lastIndexOf(':');
    if (lastColon === -1) return null;
    const parts = normalized.slice(lastColon + 1).split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return null;
    }
    normalized = `${normalized.slice(0, lastColon + 1)}${((parts[0] << 8) | parts[1]).toString(16)}:${((parts[2] << 8) | parts[3]).toString(16)}`;
  }

  const halves = normalized.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0 || (halves.length === 1 && missing !== 0)) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...tail].map((group) => parseInt(group, 16));
  if (groups.length !== 8 || groups.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return null;
  }
  return groups;
}

function isPrivateIpv6(ip) {
  const groups = parseIpv6Groups(ip);
  if (!groups) return true;

  // :: and ::1
  if (groups.every((group) => group === 0)) return true;
  if (groups.slice(0, 7).every((group) => group === 0) && groups[7] === 1) return true;

  // Unique local fc00::/7, link-local fe80::/10 and deprecated site-local
  // fec0::/10 (including abbreviated forms).
  if ((groups[0] & 0xfe00) === 0xfc00) return true;
  if ((groups[0] & 0xffc0) === 0xfe80) return true;
  if ((groups[0] & 0xffc0) === 0xfec0) return true;

  // IPv4-mapped (::ffff:0:0/96) and deprecated IPv4-compatible (::/96).
  if (groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff) {
    return isPrivateIpv4(ipv4FromGroups(groups[6], groups[7]));
  }
  if (groups.slice(0, 6).every((group) => group === 0)) {
    return isPrivateIpv4(ipv4FromGroups(groups[6], groups[7]));
  }

  // 6to4 (2002::/16) embeds an IPv4 address in groups 1 and 2.
  if (groups[0] === 0x2002) {
    return isPrivateIpv4(ipv4FromGroups(groups[1], groups[2]));
  }

  // Teredo (2001:0000::/32) stores the client IPv4 address XORed with 0xffff.
  if (groups[0] === 0x2001 && groups[1] === 0x0000) {
    return isPrivateIpv4(ipv4FromGroups(groups[6] ^ 0xffff, groups[7] ^ 0xffff));
  }

  return false;
}

function isPrivateAddress(address) {
  if (!address || typeof address !== 'string') return true;
  const family = net.isIP(address);
  if (family === 4) return isPrivateIpv4(address);
  if (family === 6) return isPrivateIpv6(address);
  return true;
}

function isBlockedHostname(hostname) {
  const clean = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!clean) return true;
  if (BLOCKED_HOSTNAMES.has(clean)) return true;
  if (clean.endsWith('.localhost') || clean.endsWith('.local') || clean.endsWith('.internal')) return true;
  // Some runtimes accept decimal/octal/hex IPv4 encodings that resolve to
  // loopback. Reject bare numeric hosts unless they are canonical dotted IPs.
  if (/^\d+$/.test(clean)) return true;
  if (/^0x[0-9a-f]+$/i.test(clean)) return true;
  return false;
}

/**
 * Validate a user-supplied outbound URL and resolve it to reject SSRF attempts.
 * Loopback and private targets are rejected unless the caller explicitly opts
 * into them (for example for a deliberate internal proxy target).
 */
async function assertSafeOutboundUrl(rawUrl, options = {}) {
  const {
    allowLoopback = false,
    allowPrivate = config.security?.allowPrivateOutbound === true,
    allowHttp = true,
    label = 'URL'
  } = options;

  let parsed;
  try {
    parsed = new URL(String(rawUrl));
  } catch {
    throw new Error(`${label} is not a valid absolute URL`);
  }

  if (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:')) {
    throw new Error(`${label} must use http:// or https://`);
  }
  if (parsed.username || parsed.password) {
    throw new Error(`${label} must not contain embedded credentials`);
  }
  if (allowLoopback && allowPrivate) {
    return { url: parsed, addresses: [] };
  }
  const hostname = parsed.hostname.replace(/^\[|\]$/g, '');
  if (isBlockedHostname(hostname)) {
    if (!allowLoopback || !['localhost', '127.0.0.1', '::1'].includes(hostname)) {
      throw new Error(`${label} points to a blocked host`);
    }
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error(`${label} host could not be resolved`);
  }
  if (!addresses || addresses.length === 0) {
    throw new Error(`${label} host could not be resolved`);
  }

  for (const entry of addresses) {
    const address = entry.address;
    const loopback = address === '127.0.0.1' || address === '::1';
    if (loopback && allowLoopback) continue;
    if (!allowPrivate && isPrivateAddress(address)) {
      throw new Error(`${label} resolves to a private or loopback address (${address})`);
    }
  }

  return { url: parsed, addresses };
}

function isSafeOutboundUrl(rawUrl, options = {}) {
  return assertSafeOutboundUrl(rawUrl, options)
    .then(() => true)
    .catch(() => false);
}

module.exports = {
  isPrivateAddress,
  isBlockedHostname,
  assertSafeOutboundUrl,
  isSafeOutboundUrl
};
