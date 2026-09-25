import { defineConfig } from 'vitest/config';

export default defineConfig({
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
        // chat-sdk-bridge wraps a third-party SDK with many deep WS/API paths
        'src/channels/chat-sdk-bridge.ts',
        // admin dashboard index is a large Express router — integration-only
        'src/cloud/admin-dashboard/index.ts',
        // agent-ping spawns a child process — integration-only
        'setup/lib/agent-ping.ts',
        // setup service scripts require OS service managers
        'setup/service.ts',
        'setup/groups.ts',
        'setup/onecli.ts',
        'setup/register.ts',
        'setup/whatsapp-auth.ts',
        'setup/signal-auth.ts',
        'setup/peer-cleanup.ts',
        'setup/mounts.ts',
        'setup/set-env.ts',
        'setup/logs.ts',
        'setup/auth.ts',
        'setup/auto.ts',
        'setup/container.ts',
        'setup/pair-telegram.ts',
        'setup/cli-agent.ts',
        'setup/register-claude-token.ts',
        'setup/index.ts',
        // providers integrate with external AI APIs
        'src/providers/**',
        // types.ts files have no runtime logic
        '**/*.types.ts',
        // barrel re-export files — no runtime logic to cover
        'src/db/index.ts',
        'src/cloud/data-gateway/types.ts',
        // delivery.ts wraps real channel adapters — integration-only
        'src/delivery.ts',
        // redis-queue connects to a real Redis instance
        'src/cloud/redis-queue/index.ts',
        // session-db uses native better-sqlite3 bindings
        // host-sweep coordinates container mgmt — integration-only
        'src/host-sweep.ts',
        // router is the main orchestration loop — integration-only
        'src/router.ts',
        // setup/platform.ts reads /proc/version, /proc/1/comm, spawns child procs
        'setup/platform.ts',
        // db/migrations run idempotent SQL — branch coverage from optional ALTER TABLE blocks
        // is not meaningful to unit-test; migrations are exercised by integration tests
        'src/db/migrations/**',
        // session-db opens per-session SQLite files at runtime paths — integration-only
        'src/db/session-db.ts',
        // db/connection.ts — initDb path requires real disk path
        'src/db/connection.ts',
      ],
    },
  },
});
