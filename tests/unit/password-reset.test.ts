import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  send: vi.fn(),
  role: vi.fn(),
  admin: vi.fn(),
  recovery: vi.fn(),
  rpc: vi.fn(),
  getUser: vi.fn(),
}));
vi.mock("@/lib/supabase/recovery", () => ({
  createRecoveryClient: mocks.recovery,
  passwordRecoveryUrl: () => "https://one-odc-staging.vercel.app/auth/confirm",
}));
vi.mock("@/lib/workspace-session", () => ({ requireRole: mocks.role }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: mocks.admin }));
import {
  requestPasswordReset,
  adminPasswordReset,
} from "../../src/app/auth/forgot-password/actions";
const id = "10000000-0000-4000-8000-000000000006";
function form(values: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.set(k, v);
  return f;
}
beforeEach(() => {
  vi.resetAllMocks();
  mocks.recovery.mockReturnValue({
    auth: { resetPasswordForEmail: mocks.send },
  });
  mocks.send.mockResolvedValue({ error: null });
  mocks.role.mockResolvedValue({ client: { rpc: mocks.rpc } });
  mocks.admin.mockReturnValue({
    auth: { admin: { getUserById: mocks.getUser } },
  });
  mocks.getUser.mockResolvedValue({
    data: { user: { id, email: "recipient@example.com" } },
    error: null,
  });
  mocks.rpc.mockResolvedValue({ error: null });
});
it("validates recovery input without sending", async () => {
  expect(
    (await requestPasswordReset({ error: null }, form({ email: "invalid" })))
      .error,
  ).toBeTruthy();
  expect(mocks.send).not.toHaveBeenCalled();
});
it("sends a cross-device recovery link and never reveals account existence or provider errors", async () => {
  const f = form({ email: "recipient@example.com" });
  const ok = await requestPasswordReset({ error: null }, f);
  expect(mocks.send).toHaveBeenCalledWith("recipient@example.com", {
    redirectTo: "https://one-odc-staging.vercel.app/auth/confirm",
  });
  mocks.send.mockResolvedValue({ error: { message: "user missing" } });
  expect(await requestPasswordReset({ error: null }, f)).toEqual(ok);
  mocks.send.mockRejectedValue(new Error("network"));
  expect(await requestPasswordReset({ error: null }, f)).toEqual(ok);
  expect(ok.success).toContain("If an account");
});
it("requires administrator authority and uses the registered email, never submitted email", async () => {
  const result = await adminPasswordReset(
    { error: null },
    form({
      id,
      email: "attacker@example.com",
      reason: "User requested recovery",
      confirm: "true",
    }),
  );
  expect(mocks.role).toHaveBeenCalledWith(["system_administrator"]);
  expect(mocks.getUser).toHaveBeenCalledWith(id);
  expect(mocks.rpc).toHaveBeenCalledWith("record_password_reset_request", {
    p_user: id,
    p_reason: "User requested recovery",
  });
  expect(mocks.send).toHaveBeenCalledWith(
    "recipient@example.com",
    expect.anything(),
  );
  expect(result.success).toContain("Reset email");
});
it("refuses missing confirmation, failed audits and unauthorized actors before sending", async () => {
  const f = form({ id, reason: "Recovery", confirm: "false" });
  expect((await adminPasswordReset({ error: null }, f)).error).toBeTruthy();
  expect(mocks.send).not.toHaveBeenCalled();
  f.set("confirm", "true");
  mocks.rpc.mockResolvedValue({ error: { message: "ACCESS_DENIED" } });
  expect((await adminPasswordReset({ error: null }, f)).error).toBeTruthy();
  expect(mocks.send).not.toHaveBeenCalled();
  mocks.role.mockRejectedValue(new Error("denied"));
  await expect(adminPasswordReset({ error: null }, f)).rejects.toThrow(
    "denied",
  );
  expect(mocks.send).not.toHaveBeenCalled();
});
it("reports administrator delivery failures without claiming an email was sent", async () => {
  mocks.send.mockResolvedValue({ error: { message: "SMTP unavailable" } });
  expect(
    (
      await adminPasswordReset(
        { error: null },
        form({ id, reason: "Recovery", confirm: "true" }),
      )
    ).error,
  ).toBeTruthy();
});
