import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "@playwright/test";
import {
  LeadFields,
  ReviewFields,
  AttachmentList,
  AssignmentFields,
} from "../../src/components/lead-fields";

test("invitation callbacks fail closed and do not follow supplied destinations", async ({
  page,
}) => {
  await page.goto(
    "/auth/confirm?type=signup&token_hash=invalid&next=https://example.com",
  );
  await expect(page).toHaveURL(/\/auth\/error$/);
  await page.goto("/#error=access_denied&type=invite");
  await expect(page).toHaveURL(/\/auth\/error$/);
  expect(await page.evaluate(() => window.location.hash)).toBe("");
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
});

test("real shared lead and assignment fields reflow at 360px with errors and metadata", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto("/login");
  const styles = await page
    .locator('link[rel="stylesheet"]')
    .evaluateAll((elements) => elements.map((e) => e.outerHTML).join(""));
  // Presentation-only fixture renders the production components; no session or success state is faked.
  const markup = renderToStaticMarkup(
    <main style={{ padding: 16 }}>
      <section className="surface live-form">
        <h1>Lead fields layout test</h1>
        <LeadFields
          values={{
            project_name: "Residence",
            address: "Manila",
            brand: "Stosa",
            cabinetry_count: "2",
            notes: "",
            date_needed: null,
          }}
          errors={{ cabinetry_count: "Enter a positive whole number." }}
        />
        <AttachmentList
          files={[
            {
              name: "Very-long-filename-for-a-client-cabinetry-floor-plan-that-needs-to-wrap.pdf",
              size: 1000,
              mime_type: "application/pdf",
              state: "not_uploaded",
            },
          ]}
        />
        <ReviewFields
          decision="Returned for Clarification"
          remarks=""
          error="Explain why clarification is needed."
        />
        <AssignmentFields
          people={[
            {
              id: "lead",
              display_name: "Lead Designer with a long display name",
              role: "lead_designer",
            },
          ]}
          primary="lead"
          support={[]}
          ops={[]}
        />
      </section>
    </main>,
  );
  await page.setContent(
    `<!doctype html><html><head>${styles}</head><body>${markup}</body></html>`,
  );
  await expect(
    page.getByLabel("Estimated Cabinetries", { exact: false }),
  ).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByText("Not uploaded", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Remarks", { exact: false })).toHaveAttribute(
    "required",
    "",
  );
  await expect(
    page.getByLabel("Primary Designer", { exact: false }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});
