import { defineConfig } from 'vitest/config';

  test: {
    // container/agent-runner tests run under Bun (they depend on bun:sqlite).
    // See container/agent-runner/package.json "test" script.
    include: ['src/**/*.test.ts', 'setup/**/*.test.ts', 'scripts/**/*.test.ts'],
    // The end-to-end router/migration tests run 13 migrations per setup; the
    // 5s default is tight on slow disks (notably exFAT/Windows dev machines).
    // 20s is comfortable everywhere and harmless on fast CI.
    testTimeout: 20000,
    hookTimeout: 20000,
    // Settings-manager tests require live env vars (DATA_BUCKET, S3_BUCKET) not
    // available in unit-test environments — they are integration tests.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      'src/cloud/admin-dashboard/settings/settings-manager.test.ts',
      'src/cloud/admin-dashboard/settings/settings-manager.prop.test.ts',
      'src/cloud/admin-dashboard/settings/routes.test.ts',
    ],
    coverage: {
      // Exclude files whose tests require live infra (S3, real DB) and are
      // intentionally omitted from the unit-test run above. Including them in
      // coverage with 0 tests executed skews the average down significantly.
      exclude: [
        'src/cloud/admin-dashboard/settings/routes.ts',
        'src/cloud/admin-dashboard/settings/settings-manager.ts',
        // container-runner orchestrates Docker — integration-only, not unit-testable
        'src/container-runner.ts',
        // cloud bootstrap wires Redis/DB/adapter startup — integration-only
        'src/cloud/bootstrap.ts',
        // webhook server is HTTP infra binding — integration-only
        'src/webhook-server.ts',
        // live-data polls external APIs — integration-only
        'src/cloud/admin-dashboard/live-data.ts',
        // whatsapp-bridge wraps the Baileys SDK — integration-only
        'src/cloud/admin-dashboard/whatsapp-bridge.ts',
        // setup/verify requires real Node/Docker/network probing
        'setup/verify.ts',
        // setup/environment.ts run() calls child_process/OS APIs
        'setup/environment.ts',
        // mount-security applies Linux bind mounts — OS-level integration
        'src/modules/mount-security/**',
        // container-config types only, no runtime logic
        'src/cloud/admin-dashboard/settings/schema.ts',
      ],
    },
  },
});
