import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
vi.mock("../../src/app/dashboard/projects/quotation-actions", () => ({
  reviewQuotationAction: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard/projects/project",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../../src/components/financial-action-dialog", () => ({
  FinancialActionDialog: () => null,
}));
vi.mock("../../src/components/finance-form", () => ({
  FinanceForm: () => null,
  PaymentHeading: ({ children }: { children: string }) =>
    createElement("h3", null, children),
}));
vi.mock("../../src/components/quotation-editor", () => ({
  CreateQuotation: () => null,
  QuotationSpaceEditor: () => null,
}));
vi.mock("../../src/components/quotation-review-form", () => ({
  QuotationReviewForm: () => null,
}));
import { FinancialWorkspace } from "../../src/components/ui-r3/financials";
import { QuotationWorkspace } from "../../src/components/ui-r3/quotation";
import type { Financials } from "../../src/lib/finance";
import type { Quotation } from "../../src/lib/quotations";
const base: Financials = {
  project_id: "project",
  currency: "PHP",
  today: "2026-10-16",
  cancelled: false,
  can_manage_payments: false,
  client_payments: { total: "0.10", records: [] },
  supplier_payments: { total: "0.20", outstanding: "-0.10", records: [] },
};
it("Ops-redacted financial DTO never creates quotation or Sale content, but preserves negative balances", () => {
  const html = renderToStaticMarkup(
    createElement(FinancialWorkspace, {
      project: "project",
      financials: base,
      admin: false,
    }),
  );
  expect(html).not.toContain("Approved Quotation");
  expect(html).not.toContain("Sale management");
  expect(html).not.toContain("Adjust Sale");
  expect(html).toContain("possible overpayment");
  expect(html).toContain("−₱0.10");
  expect(html).not.toContain("Add client payment");
});
it("allowed financial values remain distinct and decimal safe without implying profit", () => {
  const html = renderToStaticMarkup(
    createElement(FinancialWorkspace, {
      project: "project",
      financials: {
        ...base,
        sale: {
          amount: "1234567890123.45",
          version: 1,
          editable: false,
          history: [],
        },
        raw: { amount: "0.20", version: 1, editable: false, history: [] },
        approved_quotation: { id: "q1", number: 1, total: "0.30" },
        sale_minus_raw: "1234567890123.25",
      },
      admin: false,
    }),
  );
  expect(html).toContain("₱1,234,567,890,123.45");
  expect(html).toContain("Gross Difference");
  expect(html).toContain("excludes other expenses and taxes");
  expect(html).not.toContain("net profit");
  expect(html).toContain("tab=quotation&amp;version=q1");
});
it("BDM empty quotation explains approved-only visibility without draft CTA", () => {
  const html = renderToStaticMarkup(
    createElement(QuotationWorkspace, {
      project: "p",
      quotation: null,
      versions: [],
      comparison: null,
      cancelled: false,
      role: "bdm",
    }),
  );
  expect(html).toContain("No approved quotation");
  expect(html).not.toContain("Create quotation draft");
});
it("locked historical spaces and items render their snapshots, escaped, with accurate amounts", () => {
  const q = {
    id: "q1",
    project_id: "p",
    number: 1,
    state: "Approved",
    total: "0.11",
    can_submit: false,
    can_review: false,
    can_create_draft: false,
    history: [],
    spaces: [
      {
        id: "s1",
        name: "Kitchen <script>",
        cancelled: false,
        editable: false,
        subtotal: "0.11",
        items: [
          {
            id: "i1",
            description: "Cabinet <img>",
            quantity: "0.005",
            unit_price: "21.00",
            line_amount: "0.11",
          },
        ],
      },
    ],
  } as unknown as Quotation;
  const html = renderToStaticMarkup(
    createElement(QuotationWorkspace, {
      project: "p",
      quotation: q,
      versions: [
        {
          id: q.id,
          number: 1,
          state: "Approved",
          created_by: "actor",
          created_at: "2026-10-16T00:00:00Z",
          reviewed_at: null,
          reviewed_by: null,
          submitted_at: null,
        },
      ],
      comparison: null,
      cancelled: false,
      role: "bdm",
    }),
  );
  expect(html).toContain("Locked snapshot");
  expect(html).toContain("Kitchen &lt;script&gt;");
  expect(html).toContain("Cabinet &lt;img&gt;");
  expect(html).toContain("₱0.11");
  expect(html).not.toContain("Edit items for");
  expect(html).not.toContain("Submit for Review</button>");
});
it("BDM receipt capability reveals only the client add control and respects locked projects", () => {
  const html = renderToStaticMarkup(
    createElement(FinancialWorkspace, {
      project: "project",
      financials: { ...base, can_record_client_payments: true },
      admin: false,
    }),
  );
  expect(html).toContain("Add client payment");
  expect(html).not.toContain("Add supplier payment");
  expect(html).not.toContain("Correct or void");
  expect(html).not.toContain("Raw management");
  const locked = renderToStaticMarkup(
    createElement(FinancialWorkspace, {
      project: "project",
      financials: {
        ...base,
        can_record_client_payments: true,
        cancelled: true,
      },
      admin: false,
    }),
  );
  expect(locked).not.toContain("Add client payment");
});
it("Ops supplier-only capability never exposes a client add control", () => {
  const html = renderToStaticMarkup(
    createElement(FinancialWorkspace, {
      project: "project",
      financials: {
        ...base,
        can_manage_client_payments: false,
        can_manage_supplier_payments: true,
        can_manage_payments: false,
      },
      admin: false,
    }),
  );
  expect(html).toContain("Add supplier payment");
  expect(html).not.toContain("Add client payment");
});
