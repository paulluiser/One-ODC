export type Project = {
  id: string;
  name: string;
  location: string;
  brand: string;
  designer: string;
  initials: string;
  tone: string;
  completed: number;
  spaces: number;
  deadline: string;
  risk: "On Track" | "At Risk" | "Overdue";
  commercial: string;
  installation: string;
};
// Entirely fictional fixtures. Anchored to 13 October 2026 for reproducible demonstrations.
export const demoDate = "2026-10-13";
export const projects: Project[] = [
  {
    id: "ODC-2026-024",
    name: "The Rivera Residence",
    location: "Makati City",
    brand: "Stosa",
    designer: "Isabel Santos",
    initials: "IS",
    tone: "blue",
    completed: 4,
    spaces: 6,
    deadline: "2026-10-20",
    risk: "On Track",
    commercial: "Closed",
    installation: "In Progress",
  },
  {
    id: "ODC-2026-023",
    name: "Parkside Penthouse",
    location: "Bonifacio Global City",
    brand: "Both",
    designer: "Marco Reyes",
    initials: "MR",
    tone: "sand",
    completed: 2,
    spaces: 5,
    deadline: "2026-10-15",
    risk: "At Risk",
    commercial: "Under Negotiation",
    installation: "Not Scheduled",
  },
  {
    id: "ODC-2026-021",
    name: "Casa de Lorenzo",
    location: "Alabang",
    brand: "SFY",
    designer: "Sofia Cruz",
    initials: "SC",
    tone: "sage",
    completed: 3,
    spaces: 4,
    deadline: "2026-10-11",
    risk: "Overdue",
    commercial: "Closed",
    installation: "Scheduled",
  },
  {
    id: "ODC-2026-019",
    name: "The Westwood Suite",
    location: "Quezon City",
    brand: "Stosa",
    designer: "Isabel Santos",
    initials: "IS",
    tone: "blue",
    completed: 1,
    spaces: 3,
    deadline: "2026-10-28",
    risk: "On Track",
    commercial: "For Quotation",
    installation: "Not Scheduled",
  },
  {
    id: "ODC-2026-018",
    name: "Amara Coastal Home",
    location: "Batangas",
    brand: "Both",
    designer: "Marco Reyes",
    initials: "MR",
    tone: "sand",
    completed: 6,
    spaces: 8,
    deadline: "2026-10-16",
    risk: "At Risk",
    commercial: "Closed",
    installation: "In Progress",
  },
];
export const reviews = [
  {
    id: "review-lead",
    type: "Lead review",
    name: "The Mendoza Residence",
    detail: "New request · Stosa · 4 cabinetries",
    age: "2 days waiting",
    action: "Review lead",
    icon: "lead",
  },
  {
    id: "review-quote",
    type: "Quotation review",
    name: "The Westwood Suite",
    detail: "Quotation v2 · 3 spaces",
    age: "1 day waiting",
    action: "Review quotation",
    icon: "quote",
  },
  {
    id: "review-revision",
    type: "Design revision",
    name: "Casa de Lorenzo",
    detail: "Kitchen · Sofia Cruz",
    age: "2 days overdue",
    action: "View space",
    icon: "revision",
  },
];
