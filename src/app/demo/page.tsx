import { Workspace } from "@/components/workspace";
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; filter?: string }>;
}) {
  const params = await searchParams;
  const pages = [
    "dashboard",
    "leads",
    "projects",
    "my-work",
    "calendar",
    "reports",
    "settings",
  ];
  return (
    <Workspace
      key={`${params.page ?? "dashboard"}:${params.filter ?? "All projects"}`}
      section={pages.includes(params.page ?? "") ? params.page! : "dashboard"}
      initialFilter={params.filter ?? "All projects"}
    />
  );
}
