export type AssignmentSpace = {
  id: string;
  name: string;
  version: number;
  primary: string;
  support: string[];
  eligible: boolean;
};
export type AssignmentPlan = { primary: string; support: string[] };
const same = (a: string[], b: string[]) =>
  [...a].sort().join(",") === [...b].sort().join(",");
export function planSpaceAssignments(
  spaces: AssignmentSpace[],
  primary: string,
  support: string[] | null,
): { plan?: AssignmentPlan; error?: string } {
  if (
    !spaces.length ||
    spaces.length > 100 ||
    new Set(spaces.map((s) => s.id)).size !== spaces.length ||
    spaces.some((s) => !s.eligible)
  )
    return { error: "Select 1–100 eligible Spaces." };
  if (!primary && spaces.some((s) => s.primary !== spaces[0].primary))
    return {
      error:
        "These Spaces have different Primary Designers. Choose an explicit replacement.",
    };
  if (
    support === null &&
    spaces.some((s) => !same(s.support, spaces[0].support))
  )
    return {
      error:
        "These Spaces have different supporting teams. Choose Replace supporting team to continue.",
    };
  const plan = {
    primary: primary || spaces[0].primary,
    support: support ?? spaces[0].support,
  };
  if (plan.support.includes(plan.primary))
    return {
      error:
        "The Primary Designer cannot also be a Supporting Designer. Explicitly replace the supporting team to remove that overlap.",
    };
  if (
    plan.support.length > 50 ||
    new Set(plan.support).size !== plan.support.length
  )
    return { error: "Choose up to 50 distinct Supporting Designers." };
  if (
    spaces.every(
      (s) => s.primary === plan.primary && same(s.support, plan.support),
    )
  )
    return { error: "Choose an assignment change before continuing." };
  return { plan };
}
export function selectSpacePage(
  selected: AssignmentSpace[],
  page: AssignmentSpace[],
  checked: boolean,
) {
  const available = page.filter((s) => s.eligible);
  const ids = new Set(available.map((s) => s.id));
  if (!checked) return selected.filter((s) => !ids.has(s.id));
  const combined = [
    ...selected,
    ...available.filter((s) => !selected.some((v) => v.id === s.id)),
  ];
  return combined.length > 100 ? null : combined;
}
