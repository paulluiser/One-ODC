import type { Person } from "./phase1";
export function designerOptions(people: Person[], primary = "") {
  return people.filter(
    (p) => ["designer", "lead_designer"].includes(p.role) && p.id !== primary,
  );
}
export function orderedOperations(ops: string[], primary: string) {
  return primary && ops.includes(primary)
    ? [primary, ...[...new Set(ops)].filter((id) => id !== primary)]
    : [...new Set(ops)];
}
