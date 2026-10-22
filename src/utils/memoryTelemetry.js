'use strict';

/**
 * Memory telemetry & parsing utility for Linux host & container environments.
 * Handles /proc/meminfo, cgroup v1/v2, OpenVZ environments, and fallback free commands.
 */

/**
 * Convert bytes to GiB (1024^3).
 * @param {number} bytes
 * @param {number} decimals
 * @returns {number}
 */
function bytesToGib(bytes, decimals = 2) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return 0;
  const gib = num / (1024 * 1024 * 1024);
  return decimals === 0 ? Math.round(gib) : parseFloat(gib.toFixed(decimals));
}

/**
 * Convert bytes to MiB (1024^2).
 * @param {number} bytes
 * @returns {number}
 */
function bytesToMib(bytes) {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return 0;
  return Math.round(num / (1024 * 1024));
}

/**
 * Convert KiB (1024) to MiB.
 * @param {number} kb
 * @returns {number}
 */
function kbToMib(kb) {
  const num = Number(kb);
  if (isNaN(num) || num <= 0) return 0;
  return Math.round(num / 1024);
}

/**
 * Parses /proc/meminfo string content.
 * Returns host memory metrics in MB and GB.
 * @param {string} content
 * @returns {object|null}
 */
function parseMeminfo(content) {
  if (!content || typeof content !== 'string') return null;

  const lines = content.split('\n');
  const values = {};
  for (const line of lines) {
    const match = line.match(/^([A-Za-z0-9_()]+):\s+(\d+)/);
    if (match) {
      values[match[1]] = parseInt(match[2], 10);
    }
  }

  const memTotalKb = values.MemTotal;
  if (!memTotalKb || isNaN(memTotalKb)) return null;

  const memFreeKb = values.MemFree || 0;
  const buffersKb = values.Buffers || 0;
  const cachedKb = values.Cached || 0;
  const sReclaimableKb = values.SReclaimable || 0;
  const shmemKb = values.Shmem || 0;

  // Modern kernels (>= 3.14) provide MemAvailable
  let memAvailableKb = values.MemAvailable;
  if (memAvailableKb === undefined || isNaN(memAvailableKb)) {
    // Fallback formula for available memory: Free + Buffers + Cached + SReclaimable - Shmem
    memAvailableKb = Math.max(0, memFreeKb + buffersKb + cachedKb + sReclaimableKb - shmemKb);
  }

  // Linux free command calculates used = total - free - buffers - cache
  // where cache = Cached + SReclaimable
  const totalCachedKb = cachedKb + sReclaimableKb;
  let memUsedKb = memTotalKb - memFreeKb - buffersKb - totalCachedKb;
  if (memUsedKb < 0 || isNaN(memUsedKb)) {
    memUsedKb = Math.max(0, memTotalKb - memAvailableKb);
  }

  const totalMb = Math.round(memTotalKb / 1024);
  const freeMb = Math.round(memFreeKb / 1024);
  const availableMb = Math.round(memAvailableKb / 1024);
  const usedMb = Math.round(memUsedKb / 1024);

  return {
    totalKb: memTotalKb,
    freeKb: memFreeKb,
    availableKb: memAvailableKb,
    usedKb: memUsedKb,
    totalMb,
    freeMb,
    availableMb,
    usedMb,
    totalBytes: memTotalKb * 1024,
    freeBytes: memFreeKb * 1024,
    availableBytes: memAvailableKb * 1024,
    usedBytes: memUsedKb * 1024,
    totalGib: parseFloat((memTotalKb / (1024 * 1024)).toFixed(2)),
    availableGib: parseFloat((memAvailableKb / (1024 * 1024)).toFixed(2)),
    usedGib: parseFloat((memUsedKb / (1024 * 1024)).toFixed(2)),
    freeGib: parseFloat((memFreeKb / (1024 * 1024)).toFixed(2))
  };
}

/**
 * Parses cgroup v1 and cgroup v2 container memory limits and usage.
 * @param {string|number} limitRaw Content of memory.max or memory.limit_in_bytes
 * @param {string|number} usageRaw Content of memory.current or memory.usage_in_bytes
 * @param {number} hostTotalBytes Host total memory in bytes from /proc/meminfo
 * @returns {{ containerLimitMb: number|null, containerUsedMb: number|null, containerLimitBytes: number|null, containerUsedBytes: number|null, hasLimit: boolean }}
 */
function parseCgroupMemory(limitRaw, usageRaw, hostTotalBytes = 0) {
  const result = {
    containerLimitMb: null,
    containerUsedMb: null,
    containerLimitBytes: null,
    containerUsedBytes: null,
    hasLimit: false
  };

  if (limitRaw === undefined || limitRaw === null) return result;

  const limitStr = String(limitRaw).trim();
  if (limitStr === 'max' || limitStr === 'NONE' || limitStr === '' || limitStr === 'unlimited') {
    return result;
  }

  const limitBytes = parseInt(limitStr, 10);
  if (isNaN(limitBytes) || limitBytes <= 0) {
    return result;
  }

  // In cgroup v1, unlimited is represented as (2^63 - 4096) or 9223372036854771712 / 9223372036854775807
  const CGROUP_UNLIMITED_THRESHOLD = 9000000000000000000;
  if (limitBytes >= CGROUP_UNLIMITED_THRESHOLD) {
    return result;
  }

  // If container limit is equal to or greater than host physical RAM, it is not a restricting container limit
  if (hostTotalBytes > 0 && limitBytes >= hostTotalBytes) {
    return result;
  }

  // Restricting container limit is present
  result.hasLimit = true;
  result.containerLimitBytes = limitBytes;
  result.containerLimitMb = Math.round(limitBytes / (1024 * 1024));

  if (usageRaw) {
    const usageStr = String(usageRaw).trim();
    const usageBytes = parseInt(usageStr, 10);
    if (!isNaN(usageBytes) && usageBytes >= 0 && usageBytes < CGROUP_UNLIMITED_THRESHOLD) {
      result.containerUsedBytes = usageBytes;
      result.containerUsedMb = Math.round(usageBytes / (1024 * 1024));
    }
  }

  return result;
}

/**
 * Fallback parser for standard "free -m" or "free -b" output.
 * Handles English ("Mem:") as well as localized headers (e.g. German "Speicher:").
 * @param {string} stdout
 * @param {'mb'|'bytes'} unit
 * @returns {object|null}
 */
function parseFreeCommandOutput(stdout, unit = 'mb') {
  if (!stdout || typeof stdout !== 'string') return null;

  const lines = stdout.split('\n');
  for (const line of lines) {
    const parts = line.trim().split(/\s+/);
    if (parts.length >= 4 && (/^(mem|speicher|mémoire|memoria):?$/i.test(parts[0]) || !isNaN(parseInt(parts[1], 10)))) {
      const offset = isNaN(parseInt(parts[0], 10)) ? 1 : 0;
      let total = parseInt(parts[offset], 10);
      let used = parseInt(parts[offset + 1], 10);
      let free = parseInt(parts[offset + 2], 10);
      let available = parts.length > offset + 5 && !isNaN(parseInt(parts[offset + 5], 10))
        ? parseInt(parts[offset + 5], 10)
        : free;

      if (!isNaN(total) && total > 0) {
        if (unit === 'bytes') {
          total = Math.round(total / (1024 * 1024));
          used = Math.round(used / (1024 * 1024));
          free = Math.round(free / (1024 * 1024));
          available = Math.round(available / (1024 * 1024));
        }
        return {
          totalMb: total,
          usedMb: isNaN(used) ? 0 : used,
          freeMb: isNaN(free) ? 0 : free,
          availableMb: isNaN(available) ? free : available,
          totalGib: parseFloat((total / 1024).toFixed(2)),
          availableGib: parseFloat((available / 1024).toFixed(2)),
          usedGib: parseFloat((used / 1024).toFixed(2)),
          freeGib: parseFloat((free / 1024).toFixed(2))
        };
      }
    }
  }
  return null;
}

/**
 * Combined memory probe parser that processes the full SSH telemetry output.
 * @param {string} probeStdout
 * @returns {object}
 */
function parseMemoryTelemetry(probeStdout) {
  if (!probeStdout || typeof probeStdout !== 'string') {
    return {
      ramTotalMb: 0,
      ramMb: 0,
      ramUsedMb: 0,
      ramFreeMb: 0,
      ramAvailableMb: 0,
      containerLimitMb: null,
      containerUsedMb: null,
      rawMetrics: null
    };
  }

  // Split on delimiters
  const limitMarker = '===CGROUP_LIMIT===';
  const usageMarker = '===CGROUP_USAGE===';
  const ubcMarker = '===OPEN_VZ_UBC===';

  let meminfoPart = probeStdout;
  let cgroupLimitPart = '';
  let cgroupUsagePart = '';
  let ubcPart = '';

  if (probeStdout.includes(limitMarker)) {
    const parts1 = probeStdout.split(limitMarker);
    meminfoPart = parts1[0];
    const rest = parts1[1] || '';
    if (rest.includes(usageMarker)) {
      const parts2 = rest.split(usageMarker);
      cgroupLimitPart = parts2[0].trim();
      const rest2 = parts2[1] || '';
      if (rest2.includes(ubcMarker)) {
        const parts3 = rest2.split(ubcMarker);
        cgroupUsagePart = parts3[0].trim();
        ubcPart = parts3[1].trim();
      } else {
        cgroupUsagePart = rest2.trim();
      }
    } else {
      cgroupLimitPart = rest.trim();
    }
  }

  // 1. Parse host memory from /proc/meminfo or fallback free
  let hostMem = parseMeminfo(meminfoPart);
  if (!hostMem) {
    hostMem = parseFreeCommandOutput(meminfoPart, 'mb');
  }

  const hostTotalBytes = hostMem?.totalBytes || (hostMem ? hostMem.totalMb * 1024 * 1024 : 0);

  // 2. Parse cgroup memory limits
  let cgroupData = parseCgroupMemory(cgroupLimitPart, cgroupUsagePart, hostTotalBytes);

  // 3. Fallback OpenVZ user_beancounters check if cgroup was not restrictive
  if (!cgroupData.hasLimit && ubcPart && ubcPart !== 'NONE') {
    const lines = ubcPart.split('\n');
    for (const line of lines) {
      const match = line.match(/(?:physpages|oomguarpages|privvmpages)\s+\d+\s+\d+\s+(\d+)\s+(\d+)/);
      if (match) {
        const limitPages = parseInt(match[2], 10);
        if (!isNaN(limitPages) && limitPages > 0 && limitPages < 900000000000) {
          const limitBytes = limitPages * 4096;
          if (hostTotalBytes > 0 && limitBytes < hostTotalBytes) {
            cgroupData = {
              containerLimitMb: Math.round(limitBytes / (1024 * 1024)),
              containerUsedMb: null,
              containerLimitBytes: limitBytes,
              containerUsedBytes: null,
              hasLimit: true
            };
            break;
          }
        }
      }
    }
  }

  const totalMb = hostMem ? hostMem.totalMb : 0;
  const usedMb = hostMem ? hostMem.usedMb : 0;
  const freeMb = hostMem ? hostMem.freeMb : 0;
  const availableMb = hostMem ? hostMem.availableMb : freeMb;

  return {
    ramTotalMb: totalMb,
    ramMb: totalMb, // for backward compatibility with bot & admin
    ramUsedMb: usedMb,
    ramFreeMb: freeMb,
    ramAvailableMb: availableMb,
    containerLimitMb: cgroupData.hasLimit ? cgroupData.containerLimitMb : null,
    containerUsedMb: cgroupData.hasLimit ? cgroupData.containerUsedMb : null,
    totalGib: hostMem ? hostMem.totalGib : parseFloat((totalMb / 1024).toFixed(2)),
    availableGib: hostMem ? hostMem.availableGib : parseFloat((availableMb / 1024).toFixed(2)),
    usedGib: hostMem ? hostMem.usedGib : parseFloat((usedMb / 1024).toFixed(2)),
    freeGib: hostMem ? hostMem.freeGib : parseFloat((freeMb / 1024).toFixed(2))
  };
}

/**
 * Determines whether telemetry is stale.
 * Normalizes SQLite space-separated timestamps ("YYYY-MM-DD HH:MM:SS") to UTC ISO
 * to prevent timezone interpretation errors.
 * @param {string|Date} lastPingAt
 * @param {number} thresholdMs Default: 15 minutes (900000 ms)
 * @param {number} now
 * @returns {boolean}
 */
function isTelemetryStale(lastPingAt, thresholdMs = 15 * 60 * 1000, now = Date.now()) {
  if (!lastPingAt) return true;
  let isoStr = String(lastPingAt).trim();
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(isoStr)) {
    isoStr = isoStr.replace(' ', 'T') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(isoStr) && !isoStr.endsWith('Z') && !isoStr.includes('+')) {
    isoStr = isoStr + 'Z';
  }
  const date = new Date(isoStr);
  if (isNaN(date.getTime())) return true;
  return (now - date.getTime()) > thresholdMs;
}

/**
 * Format MB value into human-readable string (GB or MB).
 * @param {number} mb
 * @returns {string}
 */
function formatMemoryMb(mb) {
  if (mb === undefined || mb === null || isNaN(mb)) return '0 MB';
  const num = Number(mb);
  if (num >= 1024) {
    const gb = num / 1024;
    return `${Number.isInteger(gb) ? gb : gb.toFixed(1)} GB`;
  }
  return `${Math.round(num)} MB`;
}

module.exports = {
  bytesToGib,
  bytesToMib,
  kbToMib,
  parseMeminfo,
  parseCgroupMemory,
  parseFreeCommandOutput,
  parseMemoryTelemetry,
  isTelemetryStale,
  formatMemoryMb
};
