/**
 * Minimální IPv4/IPv6 CIDR matcher bez externích závislostí.
 * Použití: `isIpInAnyCidr('1.2.3.4', ['1.2.3.0/24'])`.
 */

export function isIpInAnyCidr(ip: string, cidrs: string[]): boolean {
  return cidrs.some((cidr) => isIpInCidr(ip, cidr));
}

export function isIpInCidr(ip: string, cidr: string): boolean {
  const [range, prefixStr] = cidr.split('/');
  if (!range || !prefixStr) return false;
  const prefix = Number.parseInt(prefixStr, 10);
  if (!Number.isFinite(prefix) || prefix < 0) return false;

  if (ip.includes(':') || range.includes(':')) {
    return matchIpv6(ip, range, prefix);
  }
  return matchIpv4(ip, range, prefix);
}

function matchIpv4(ip: string, range: string, prefix: number): boolean {
  if (prefix > 32) return false;
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(range);
  if (ipInt === null || rangeInt === null) return false;
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : ((1 << prefix) - 1) << (32 - prefix);
  return (ipInt & mask) === (rangeInt & mask);
}

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let result = 0;
  for (const part of parts) {
    const octet = Number.parseInt(part, 10);
    if (!Number.isFinite(octet) || octet < 0 || octet > 255 || part === '') return null;
    result = (result << 8) | octet;
  }
  return result >>> 0;
}

function matchIpv6(ip: string, range: string, prefix: number): boolean {
  if (prefix > 128) return false;
  const ipBytes = ipv6ToBytes(ip);
  const rangeBytes = ipv6ToBytes(range);
  if (!ipBytes || !rangeBytes) return false;
  const fullBytes = Math.floor(prefix / 8);
  for (let i = 0; i < fullBytes; i += 1) {
    if (ipBytes[i] !== rangeBytes[i]) return false;
  }
  const remainingBits = prefix % 8;
  if (remainingBits === 0) return true;
  const mask = (0xff << (8 - remainingBits)) & 0xff;
  return ((ipBytes[fullBytes] ?? 0) & mask) === ((rangeBytes[fullBytes] ?? 0) & mask);
}

function ipv6ToBytes(ip: string): Uint8Array | null {
  const cleaned = ip.includes('%') ? ip.slice(0, ip.indexOf('%')) : ip;
  const doubleColonIdx = cleaned.indexOf('::');
  let head: string[] = [];
  let tail: string[] = [];
  if (doubleColonIdx === -1) {
    head = cleaned.split(':');
  } else {
    head = cleaned.slice(0, doubleColonIdx).split(':').filter((p) => p.length > 0);
    tail = cleaned.slice(doubleColonIdx + 2).split(':').filter((p) => p.length > 0);
  }
  const missing = 8 - (head.length + tail.length);
  if (missing < 0) return null;
  const groups = [...head, ...Array.from({ length: missing }, () => '0'), ...tail];
  if (groups.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i += 1) {
    const group = groups[i];
    if (!group) return null;
    const value = Number.parseInt(group, 16);
    if (!Number.isFinite(value) || value < 0 || value > 0xffff) return null;
    bytes[i * 2] = (value >> 8) & 0xff;
    bytes[i * 2 + 1] = value & 0xff;
  }
  return bytes;
}
