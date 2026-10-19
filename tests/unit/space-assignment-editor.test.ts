import { expect, it } from "vitest";
import {
  planSpaceAssignments,
  selectSpacePage,
  type AssignmentSpace,
} from "../../src/lib/space-assignment-editor";
const space = (
  id: string,
  primary = "d",
  support: string[] = ["s"],
): AssignmentSpace => ({
  id,
  name: id,
  primary,
  support,
  version: 1,
  eligible: true,
});
it("preserves untouched supporting teams and rejects silent flattening of mixed teams", () => {
  expect(
    planSpaceAssignments([space("a"), space("b")], "new", null).plan,
  ).toEqual({ primary: "new", support: ["s"] });
  expect(
    planSpaceAssignments([space("a"), space("b", "d", ["other"])], "new", null)
      .error,
  ).toMatch(/different supporting teams/);
});
it("requires explicit primary replacement for mixed primary assignments", () => {
  expect(
    planSpaceAssignments([space("a"), space("b", "other")], "", []).error,
  ).toMatch(/different Primary/);
  expect(
    planSpaceAssignments([space("a"), space("b", "other")], "new", []).plan,
  ).toEqual({ primary: "new", support: [] });
});
it("distinguishes explicitly clearing supporting teams from unchanged and rejects no-op changes", () => {
  expect(planSpaceAssignments([space("a")], "", []).plan).toEqual({
    primary: "d",
    support: [],
  });
  expect(planSpaceAssignments([space("a")], "", null).error).toMatch(
    /assignment change/,
  );
  expect(planSpaceAssignments([space("a")], "s", null).error).toMatch(
    /cannot also/,
  );
});
it("selection only adds the visible eligible page while preserving hidden selections", () => {
  const selected = [space("hidden")],
    page = [space("shown"), { ...space("cancelled"), eligible: false }];
  expect(selectSpacePage(selected, page, true)?.map((s) => s.id)).toEqual([
    "hidden",
    "shown",
  ]);
  expect(
    selectSpacePage([space("hidden"), space("shown")], page, false)?.map(
      (s) => s.id,
    ),
  ).toEqual(["hidden"]);
});
it("selection and planning enforce the 100-space maximum without dropping existing selections", () => {
  const selected = Array.from({ length: 100 }, (_, i) => space(String(i)));
  expect(selectSpacePage(selected, [space("extra")], true)).toBeNull();
  expect(selectSpacePage(selected, [space("0")], true)).toHaveLength(100);
  expect(
    planSpaceAssignments([...selected, space("extra")], "new", null).error,
  ).toMatch(/1–100/);
});
it("rejects duplicate or ineligible spaces and duplicate supporting assignments", () => {
  expect(
    planSpaceAssignments([space("a"), space("a")], "new", null).error,
  ).toBeTruthy();
  expect(
    planSpaceAssignments([{ ...space("a"), eligible: false }], "new", null)
      .error,
  ).toBeTruthy();
  expect(
    planSpaceAssignments([space("a")], "new", ["s", "s"]).error,
  ).toBeTruthy();
});
