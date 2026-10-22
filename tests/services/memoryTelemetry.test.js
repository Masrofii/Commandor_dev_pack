'use strict';

const {
  bytesToGib,
  bytesToMib,
  kbToMib,
  parseMeminfo,
  parseCgroupMemory,
  parseFreeCommandOutput,
  parseMemoryTelemetry,
  isTelemetryStale,
  formatMemoryMb
} = require('../../src/utils/memoryTelemetry');

describe('Memory Telemetry - Unit Conversions', () => {
  test('converts bytes to GiB (binary 1024^3) accurately', () => {
    // 60 GiB in bytes: 60 * 1024 * 1024 * 1024 = 64424509440
    expect(bytesToGib(64424509440)).toBe(60);
    expect(bytesToGib(64424509440, 0)).toBe(60);

    // 1 GiB
    expect(bytesToGib(1073741824)).toBe(1);

    // 3.7 GiB
    const bytes37 = Math.round(3.7 * 1024 * 1024 * 1024);
    expect(bytesToGib(bytes37, 1)).toBe(3.7);

    // Edge cases
    expect(bytesToGib(0)).toBe(0);
    expect(bytesToGib(-100)).toBe(0);
    expect(bytesToGib(NaN)).toBe(0);
    expect(bytesToGib(null)).toBe(0);
    expect(bytesToGib(undefined)).toBe(0);
    expect(bytesToGib('64424509440')).toBe(60);
  });

  test('converts bytes to MiB accurately', () => {
    expect(bytesToMib(64424509440)).toBe(61440);
    expect(bytesToMib(1048576)).toBe(1);
    expect(bytesToMib(536870912)).toBe(512);
    expect(bytesToMib(0)).toBe(0);
  });

  test('converts KiB to MiB accurately', () => {
    // 60 GiB in kB: 62914560 kB
    expect(kbToMib(62914560)).toBe(61440);
    expect(kbToMib(1024)).toBe(1);
    expect(kbToMib(524288)).toBe(512);
    expect(kbToMib(0)).toBe(0);
  });

  test('formats memory in MB or GB appropriately', () => {
    expect(formatMemoryMb(61440)).toBe('60 GB');
    expect(formatMemoryMb(1024)).toBe('1 GB');
    expect(formatMemoryMb(1536)).toBe('1.5 GB');
    expect(formatMemoryMb(512)).toBe('512 MB');
    expect(formatMemoryMb(256)).toBe('256 MB');
    expect(formatMemoryMb(0)).toBe('0 MB');
    expect(formatMemoryMb(null)).toBe('0 MB');
    expect(formatMemoryMb(NaN)).toBe('0 MB');
  });
});

describe('Memory Telemetry - /proc/meminfo Detection', () => {
  const openVzMeminfo = `
MemTotal:       62914560 kB
MemFree:        49405204 kB
MemAvailable:   58573316 kB
Buffers:               0 kB
Cached:          8977752 kB
SwapCached:            0 kB
Active:          7427924 kB
Inactive:        4431792 kB
Active(anon):    1837440 kB
Inactive(anon):  1526236 kB
Active(file):    5590484 kB
Inactive(file):  2905556 kB
Unevictable:           0 kB
Mlocked:               0 kB
SwapTotal:             0 kB
SwapFree:              0 kB
Dirty:               464 kB
Writeback:             0 kB
AnonPages:       3363676 kB
Mapped:           481712 kB
Shmem:            481712 kB
KReclaimable:     672088 kB
Slab:             783920 kB
SReclaimable:     672088 kB
SUnreclaim:       111832 kB
KernelStack:       10240 kB
PageTables:        18432 kB
NFS_Unstable:          0 kB
Bounce:                0 kB
WritebackTmp:          0 kB
CommitLimit:    31457280 kB
Committed_AS:    7839200 kB
VmallocTotal:   34359738367 kB
VmallocUsed:           0 kB
VmallocChunk:          0 kB
Percpu:             4096 kB
HardwareCorrupted:     0 kB
AnonHugePages:         0 kB
ShmemHugePages:        0 kB
ShmemPmdMapped:        0 kB
FileHugePages:         0 kB
FilePmdMapped:         0 kB
HugePages_Total:       0
HugePages_Free:        0
HugePages_Rsvd:        0
HugePages_Surp:        0
Hugepagesize:       2048 kB
Hugetlb:               0 kB
DirectMap4k:      262144 kB
DirectMap2M:     8126464 kB
DirectMap1G:    56623104 kB
  `.trim();

  test('parses real Ubuntu 22.04.5 OpenVZ /proc/meminfo correctly', () => {
    const parsed = parseMeminfo(openVzMeminfo);
    expect(parsed).toBeDefined();

    // Host Total: 62914560 kB = 61440 MB = 60 GiB
    expect(parsed.totalKb).toBe(62914560);
    expect(parsed.totalMb).toBe(61440);
    expect(parsed.totalGib).toBe(60);

    // Host Free: 49405204 kB = 48247 MB (~47.1 GiB)
    expect(parsed.freeKb).toBe(49405204);
    expect(parsed.freeMb).toBe(48247);
    expect(parsed.freeGib).toBe(47.12);

    // Host Available: 58573316 kB = 57201 MB (~55.8 GiB)
    expect(parsed.availableKb).toBe(58573316);
    expect(parsed.availableMb).toBe(57201);
    expect(parsed.availableGib).toBe(55.86);

    // Host Used: total - free - buffers - cache (cached + sreclaimable)
    // 62914560 - 49405204 - 0 - (8977752 + 672088) = 3859516 kB = 3769 MB (~3.7 GiB)
    expect(parsed.usedMb).toBe(3769);
    expect(parsed.usedGib).toBe(3.68);
  });

  test('handles legacy kernels without MemAvailable gracefully using fallback formula', () => {
    const legacyMeminfo = `
MemTotal:       16384000 kB
MemFree:         4096000 kB
Buffers:          512000 kB
Cached:          3072000 kB
SReclaimable:     256000 kB
Shmem:            128000 kB
    `.trim();

    const parsed = parseMeminfo(legacyMeminfo);
    expect(parsed).toBeDefined();
    expect(parsed.totalMb).toBe(16000);
    expect(parsed.freeMb).toBe(4000);

    // Available fallback = Free (4096000) + Buffers (512000) + Cached (3072000) + SReclaimable (256000) - Shmem (128000)
    // = 7808000 kB = 7625 MB
    expect(parsed.availableKb).toBe(7808000);
    expect(parsed.availableMb).toBe(7625);

    // Used = 16384000 - 4096000 - 512000 - (3072000 + 256000) = 8448000 kB = 8250 MB
    expect(parsed.usedMb).toBe(8250);
  });

  test('returns null for missing, empty, or malformed meminfo content', () => {
    expect(parseMeminfo('')).toBeNull();
    expect(parseMeminfo(null)).toBeNull();
    expect(parseMeminfo(undefined)).toBeNull();
    expect(parseMeminfo('Some garbage text without mem keys')).toBeNull();
  });
});

describe('Memory Telemetry - cgroup Detection & Missing Metrics Handling', () => {
  const hostTotalBytes = 64424509440; // 60 GiB

  test('handles missing cgroup metrics gracefully ("NONE", empty, null)', () => {
    const r1 = parseCgroupMemory('NONE', 'NONE', hostTotalBytes);
    expect(r1.hasLimit).toBe(false);
    expect(r1.containerLimitMb).toBeNull();
    expect(r1.containerUsedMb).toBeNull();

    const r2 = parseCgroupMemory('', '', hostTotalBytes);
    expect(r2.hasLimit).toBe(false);
    expect(r2.containerLimitMb).toBeNull();

    const r3 = parseCgroupMemory(null, null, hostTotalBytes);
    expect(r3.hasLimit).toBe(false);
    expect(r3.containerLimitMb).toBeNull();
  });

  test('handles cgroup v2 unlimited ("max") without setting restrictive limit', () => {
    const res = parseCgroupMemory('max', '104857600', hostTotalBytes);
    expect(res.hasLimit).toBe(false);
    expect(res.containerLimitMb).toBeNull();
  });

  test('handles cgroup v1 unlimited (9223372036854771712 / 9223372036854775807)', () => {
    const res = parseCgroupMemory('9223372036854771712', '52428800', hostTotalBytes);
    expect(res.hasLimit).toBe(false);
    expect(res.containerLimitMb).toBeNull();
  });

  test('handles OpenVZ VPS setting cgroup limit equal to host total RAM', () => {
    // When OpenVZ configures memory.limit_in_bytes equal to physical RAM (64424509440)
    const res = parseCgroupMemory('64424509440', '12935385088', hostTotalBytes);
    expect(res.hasLimit).toBe(false);
    expect(res.containerLimitMb).toBeNull();
  });

  test('preserves separate container limits when a container is restricted below host RAM', () => {
    // 4 GiB container on a 60 GiB host:
    // 4 * 1024 * 1024 * 1024 = 4294967296 bytes
    // Usage: 1 GiB = 1073741824 bytes
    const res = parseCgroupMemory('4294967296', '1073741824', hostTotalBytes);
    expect(res.hasLimit).toBe(true);
    expect(res.containerLimitMb).toBe(4096);
    expect(res.containerUsedMb).toBe(1024);
  });
});

describe('Memory Telemetry - Localized Free Command Fallback', () => {
  test('parses German locale free command output (Speicher:)', () => {
    const germanFreeOutput = `
gesamt       benutzt     frei      gemns.  Puffer/Cache verfügbar
Speicher:      61440        3768       48247         470        9423       57200
Auslager:          0           0           0
    `.trim();

    const parsed = parseFreeCommandOutput(germanFreeOutput, 'mb');
    expect(parsed).toBeDefined();
    expect(parsed.totalMb).toBe(61440);
    expect(parsed.usedMb).toBe(3768);
    expect(parsed.freeMb).toBe(48247);
    expect(parsed.availableMb).toBe(57200);
    expect(parsed.totalGib).toBe(60);
  });

  test('parses standard English free command output (Mem:)', () => {
    const englishFreeOutput = `
              total        used        free      shared  buff/cache   available
Mem:          61440        3768       48247         470        9423       57200
Swap:             0           0           0
    `.trim();

    const parsed = parseFreeCommandOutput(englishFreeOutput, 'mb');
    expect(parsed).toBeDefined();
    expect(parsed.totalMb).toBe(61440);
    expect(parsed.usedMb).toBe(3768);
    expect(parsed.freeMb).toBe(48247);
    expect(parsed.availableMb).toBe(57200);
  });
});

describe('Memory Telemetry - Combined Probe Parser', () => {
  test('correctly parses full SSH probe output from OpenVZ VPS without container limits', () => {
    const fullProbeOutput = `
MemTotal:       62914560 kB
MemFree:        49405204 kB
MemAvailable:   58573316 kB
Buffers:               0 kB
Cached:          8977752 kB
Active:          7427924 kB
Inactive:        4431792 kB
SReclaimable:     672088 kB
===CGROUP_LIMIT===
64424509440
===CGROUP_USAGE===
12935385088
===OPEN_VZ_UBC===
NONE
    `.trim();

    const telemetry = parseMemoryTelemetry(fullProbeOutput);
    expect(telemetry.ramTotalMb).toBe(61440);
    expect(telemetry.ramMb).toBe(61440);
    expect(telemetry.ramFreeMb).toBe(48247);
    expect(telemetry.ramAvailableMb).toBe(57201);
    expect(telemetry.ramUsedMb).toBe(3769);
    expect(telemetry.totalGib).toBe(60);
    expect(telemetry.availableGib).toBe(55.86);
    expect(telemetry.containerLimitMb).toBeNull();
  });

  test('preserves separate container limits when cgroup is constrained', () => {
    const fullProbeOutput = `
MemTotal:       62914560 kB
MemFree:        49405204 kB
MemAvailable:   58573316 kB
Buffers:               0 kB
Cached:          8977752 kB
SReclaimable:     672088 kB
===CGROUP_LIMIT===
2147483648
===CGROUP_USAGE===
536870912
===OPEN_VZ_UBC===
NONE
    `.trim();

    const telemetry = parseMemoryTelemetry(fullProbeOutput);
    // Host memory
    expect(telemetry.ramTotalMb).toBe(61440);
    expect(telemetry.totalGib).toBe(60);
    // Container limits
    expect(telemetry.containerLimitMb).toBe(2048); // 2 GiB
    expect(telemetry.containerUsedMb).toBe(512); // 512 MB
  });
});

describe('Memory Telemetry - Stale Telemetry Detection & Timezones', () => {
  const simulatedNow = new Date('2026-10-22T18:00:00Z').getTime();

  test('identifies fresh telemetry (1 minute ago) as NOT stale', () => {
    const freshIso = '2026-10-22T17:59:00Z';
    expect(isTelemetryStale(freshIso, 15 * 60 * 1000, simulatedNow)).toBe(false);
  });

  test('identifies telemetry older than 15 minutes as stale', () => {
    const staleIso = '2026-10-22T17:40:00Z'; // 20 minutes ago
    expect(isTelemetryStale(staleIso, 15 * 60 * 1000, simulatedNow)).toBe(true);

    const veryStaleIso = '2026-10-22T15:00:00Z'; // 3 hours ago
    expect(isTelemetryStale(veryStaleIso, 15 * 60 * 1000, simulatedNow)).toBe(true);
  });

  test('correctly parses SQLite space-separated UTC timestamps without timezone distortion', () => {
    // SQLite datetime('now') generates "2026-10-22 17:58:00"
    const sqliteUtcString = '2026-10-22 17:58:00';
    // 2 minutes before simulatedNow (18:00:00Z)
    expect(isTelemetryStale(sqliteUtcString, 15 * 60 * 1000, simulatedNow)).toBe(false);

    // 3 hours before simulatedNow
    const oldSqliteString = '2026-10-22 15:00:00';
    expect(isTelemetryStale(oldSqliteString, 15 * 60 * 1000, simulatedNow)).toBe(true);
  });

  test('treats null or missing timestamp as stale', () => {
    expect(isTelemetryStale(null)).toBe(true);
    expect(isTelemetryStale(undefined)).toBe(true);
    expect(isTelemetryStale('')).toBe(true);
  });
});
