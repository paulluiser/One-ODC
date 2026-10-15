export function workspaceCrumbs(path: string, tab?: string | null) {
  const root = { label: "Workspace", href: "/dashboard" };
  const section = path.split("/")[2];
  const labels: Record<string, string> = {
    projects: "Projects",
    leads: "Leads",
    analytics: "Analytics",
    suppliers: "Supplier Masterlist",
    users: "User management",
    notifications: "Notifications",
  };
  if (!section || !labels[section]) return [root];
  const result = [
    root,
    { label: labels[section], href: `/dashboard/${section}` },
  ];
  const record = path.split("/")[3];
  if (record) {
    result.push({
      label:
        record === "new"
          ? "New request"
          : section === "projects"
            ? "Project details"
            : "Lead details",
      href: path,
    });
    if (section === "projects") {
      const tabs: Record<string, string> = {
        quotation: "Quotation",
        finance: "Financial Management",
        logistics: "Supplier & Logistics",
        installation: "Installation",
      };
      result.push({
        label: tabs[tab ?? ""] ?? "Overview",
        href: `${path}${tabs[tab ?? ""] ? `?tab=${tab}` : ""}`,
      });
    }
  }
  return result;
}
