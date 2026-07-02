// Unit tests for the in-memory brute-force bucket. No DB required —
// the persist() call to public.auth_attempts is best-effort and swallows
// errors, so it's safe to exercise the module without a live Postgres.

import { beforeEach, describe, expect, it } from "vitest";

process.env.DATABASE_URL     ??= "postgres://test/test";
process.env.JWT_SECRET       ??= "test-jwt-secret-please-ignore-32chars-min-xxxxxxx";
process.env.ANON_KEY         ??= "anon-test-key";
process.env.SERVICE_ROLE_KEY ??= "service-test-key";

// Fake FastifyRequest — only the bits ratelimit reads.
function req(ip = "1.2.3.4"): any {
  return { ip, headers: { "user-agent": "test" } };
}

describe("ratelimit buckets", () => {
  let mod: typeof import("../lib/ratelimit.js");
  beforeEach(async () => {
    mod = await import("../lib/ratelimit.js");
    mod._resetAllBuckets();
  });

  it("allows the first attempt through", () => {
    expect(mod.preCheck(req(), "sign_in", "a@x").ok).toBe(true);
  });

  it("locks the account after 8 failures then rejects the 9th", async () => {
    for (let i = 0; i < 8; i++) {
      const gate = mod.preCheck(req("9.9.9.9"), "sign_in", "user@x");
      expect(gate.ok).toBe(true);
      await mod.recordFailure(req("9.9.9.9"), "sign_in", "user@x", "bad_credentials");
    }
    const gate = mod.preCheck(req("9.9.9.9"), "sign_in", "user@x");
    expect(gate.ok).toBe(false);
    if (!gate.ok) {
      expect(gate.reason).toBe("account_locked");
      expect(gate.retryAfterSec).toBeGreaterThan(0);
    }
  });

  it("a successful sign-in resets the account bucket", async () => {
    for (let i = 0; i < 5; i++) await mod.recordFailure(req(), "sign_in", "reset@x", "bad_credentials");
    await mod.recordSuccess(req(), "sign_in", "reset@x");
    // Should be back to fresh state — 8 more failures needed to lock.
    for (let i = 0; i < 7; i++) {
      expect(mod.preCheck(req(), "sign_in", "reset@x").ok).toBe(true);
      await mod.recordFailure(req(), "sign_in", "reset@x", "bad_credentials");
    }
    expect(mod.preCheck(req(), "sign_in", "reset@x").ok).toBe(true);
  });

  it("IP bucket is independent of the account bucket", async () => {
    // 20 different accounts, 1 failure each, same IP → IP locks.
    for (let i = 0; i < 20; i++) {
      await mod.recordFailure(req("5.5.5.5"), "sign_in", `acct${i}@x`, "bad_credentials");
    }
    const gate = mod.preCheck(req("5.5.5.5"), "sign_in", "fresh-account@x");
    expect(gate.ok).toBe(false);
    if (!gate.ok) expect(gate.reason).toBe("ip_locked");
  });
});
