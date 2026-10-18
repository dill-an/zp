export type NavItem = { href: string; label: string; icon: string; permission?: string };

export const NAV_GROUPS: { label: string; items: NavItem[] }[] = [
  {
    label: "House",
    items: [
      { href: "/dashboard", label: "Dashboard", icon: "home" },
      { href: "/announcements", label: "Announcements", icon: "megaphone" },
      { href: "/events", label: "Events", icon: "calendar" },
      { href: "/meetings", label: "Meetings", icon: "users" },
    ],
  },
  {
    label: "Work",
    items: [
      { href: "/labor", label: "Labor & Cleans", icon: "sparkles" },
      { href: "/tasks", label: "Tasks", icon: "check-square" },
      { href: "/chairs", label: "Chairs", icon: "briefcase" },
      { href: "/sanctions", label: "Sanctions", icon: "gavel" },
      { href: "/maintenance", label: "Maintenance", icon: "wrench" },
    ],
  },
  {
    label: "Brothers",
    items: [
      { href: "/members", label: "Members", icon: "contact" },
      { href: "/dues", label: "Dues", icon: "dollar" },
    ],
  },
  {
    label: "",
    items: [{ href: "/settings", label: "Settings", icon: "settings" }],
  },
];
