import { it, expect } from "vitest";
import {
  workspaceView,
  workspaceUrl,
  readableProjectEvent,
} from "../../src/lib/project-workspace-view";
import { validProductivityOrigin } from "../../src/lib/request-origin";
it("maps legacy destinations to the six primary tabs", () => {
  expect(workspaceView({ tab: "quotation" })).toEqual({
    tab: "financials",
    section: "quotation",
  });
  expect(workspaceView({ tab: "finance" })).toEqual({
    tab: "financials",
    section: "finance",
  });
  expect(workspaceView({ tab: "installation" })).toEqual({
    tab: "operations",
    section: "installation",
  });
  expect(workspaceView({ tab: "logistics" })).toEqual({
    tab: "operations",
    section: "logistics",
  });
  expect(workspaceView({ tab: "activity", section: "history" })).toEqual({
    tab: "activity",
    section: "history",
  });
  expect(workspaceView({ tab: ["files"] })).toEqual({
    tab: "overview",
    section: "",
  });
  expect(workspaceUrl("project", "activity", "history")).toBe(
    "/dashboard/projects/project?tab=activity&section=history",
  );
});
it("formats system labels without exposing raw technical headings", () => {
  expect(
    readableProjectEvent("project.assignments_changed: Team updated"),
  ).toBe("Project assignments changed");
  expect(readableProjectEvent("installation.status_changed: Progress")).toBe(
    "Installation status changed",
  );
  expect(readableProjectEvent("A note", "Client Coordination")).toBe(
    "Client Coordination",
  );
});
it("accepts exact public deployment origins behind a proxy", () => {
  const config = {
    appUrl: "https://one-odc.vercel.app",
    vercel: true,
    vercelUrl: "one-current.vercel.app",
    branchUrl: "one-staging.vercel.app",
  };
  for (const origin of [
    "https://one-odc.vercel.app",
    "https://one-current.vercel.app",
    "https://one-staging.vercel.app",
  ])
    expect(
      validProductivityOrigin(
        origin,
        "http://localhost:3000/api/productivity",
        config,
      ),
    ).toBe(true);
});
it("allows only local loopback equivalents on the actual local port", () => {
  expect(
    validProductivityOrigin(
      "http://localhost:3003",
      "http://127.0.0.1:3003/api/productivity",
      {},
    ),
  ).toBe(true);
  expect(
    validProductivityOrigin(
      "http://127.0.0.1:3003",
      "http://localhost:3003/api/productivity",
      {},
    ),
  ).toBe(true);
  expect(
    validProductivityOrigin(
      "http://localhost:3004",
      "http://127.0.0.1:3003/api/productivity",
      {},
    ),
  ).toBe(false);
  expect(
    validProductivityOrigin(
      "http://localhost:3000",
      "http://localhost:3000/api/productivity",
      { vercel: true },
    ),
  ).toBe(false);
});
it("rejects missing, forged, cross-site, malformed and credential-bearing origins", () => {
  const config = { appUrl: "https://one-odc.vercel.app", vercel: true };
  for (const origin of [
    null,
    "null",
    "https://evil.test",
    "https://one-odc.vercel.app.evil.test",
    "https://one-odc.vercel.app/path",
    "https://user@one-odc.vercel.app",
  ])
    expect(
      validProductivityOrigin(
        origin,
        "http://localhost:3000/api/productivity",
        config,
      ),
    ).toBe(false);
  expect(
    validProductivityOrigin(
      "https://one-odc.vercel.app",
      "http://localhost:3000/api/productivity",
      { ...config, fetchSite: "cross-site" },
    ),
  ).toBe(false);
});
