import { expect, it } from "vitest";
import { notificationLink } from "../../src/lib/notification-link";
it("links mentions to their exact discussion message and preserves other destinations", () => {
  expect(
    notificationLink({
      project_id: "project",
      lead_id: null,
      type: "project_mention",
      comment_id: "message",
    }),
  ).toBe(
    "/dashboard/projects/project?tab=activity&section=discussion#comment-message",
  );
  expect(notificationLink({ project_id: "project", lead_id: null })).toBe(
    "/dashboard/projects/project",
  );
  expect(notificationLink({ project_id: null, lead_id: "lead" })).toBe(
    "/dashboard/leads/lead",
  );
});
