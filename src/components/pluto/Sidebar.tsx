import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity, Archive, Boxes, Building2, ChevronDown, Cloud, Database, Files,
  Gauge, GitBranch, Globe, HeartPulse, History, KeyRound, LineChart,
  LockKeyhole, LogOut, Package, Radio, Rocket, ScrollText, Search, Server,
  Settings, Shield, ShieldAlert, ShieldCheck, ShoppingBag, Sparkles, Table2,
  Terminal, Users, Waves, Zap,
} from "lucide-react";
import { useAuth } from "@/lib/pluto/auth-context";
import { WorkspaceSwitcher } from "@/components/pluto/WorkspaceSwitcher";

type Item = { to: string; label: string; icon: typeof Gauge };
type Group = { label: string; items: Item[] };

// Grouped nav — duplicate/legacy routes hidden. Every distinct page still
// reachable via CommandPalette (⌘K).
const groups: Group[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Overview", icon: Gauge },
      { to: "/dashboard/pluto-admin", label: "Pluto Admin", icon: Server },
      { to: "/dashboard/verify", label: "Live checklist", icon: Activity },
      { to: "/dashboard/integrations", label: "Integration health", icon: HeartPulse },
    ],
  },
  {
    label: "Data",
    items: [
      { to: "/dashboard/database", label: "Database", icon: Database },
      { to: "/dashboard/sql", label: "SQL runner", icon: Terminal },
      { to: "/dashboard/pluto-schema", label: "Schema", icon: Boxes },
      { to: "/dashboard/pluto-studio", label: "Data Studio", icon: Table2 },
      { to: "/dashboard/migrations", label: "Migrations", icon: GitBranch },
      { to: "/dashboard/pluto-graphql", label: "GraphQL", icon: Sparkles },
      { to: "/dashboard/api", label: "REST endpoints", icon: Radio },
    ],
  },
  {
    label: "Auth & Users",
    items: [
      { to: "/dashboard/users", label: "Users", icon: Users },
      { to: "/dashboard/mfa", label: "MFA & SSO", icon: Shield },
      { to: "/dashboard/pluto-auth-advanced", label: "OAuth / MFA / SSO", icon: Shield },
      { to: "/dashboard/pluto-orgs", label: "Orgs & Teams", icon: Building2 },
      { to: "/dashboard/rbac", label: "RBAC", icon: ShieldCheck },
      { to: "/dashboard/tokens", label: "API Tokens", icon: KeyRound },
    ],
  },
  {
    label: "Storage & Files",
    items: [
      { to: "/dashboard/storage", label: "Storage", icon: Files },
      { to: "/dashboard/pluto-storage-plus", label: "Storage v2", icon: Files },
    ],
  },
  {
    label: "Realtime & Functions",
    items: [
      { to: "/dashboard/realtime", label: "Realtime channels", icon: Radio },
      { to: "/dashboard/pluto-realtime", label: "Realtime & Presence", icon: Radio },
      { to: "/dashboard/functions", label: "Edge Functions", icon: Cloud },
      { to: "/dashboard/pluto-functions", label: "Functions", icon: Rocket },
      { to: "/dashboard/pluto-functions-plus", label: "Cron & Logs", icon: Cloud },
      { to: "/dashboard/jobs", label: "Jobs", icon: ShieldCheck },
      { to: "/dashboard/pluto-queues", label: "Queues & Jobs", icon: Waves },
      { to: "/dashboard/pluto-webhooks", label: "Webhooks", icon: Package },
    ],
  },
  {
    label: "AI & Search",
    items: [
      { to: "/dashboard/ai", label: "AI & Vector", icon: Sparkles },
      { to: "/dashboard/pluto-ai", label: "AI Gateway", icon: Sparkles },
      { to: "/dashboard/vector", label: "Vector search", icon: Search },
      { to: "/dashboard/pluto-search", label: "Search & Vector", icon: Search },
    ],
  },
  {
    label: "Ops & Observability",
    items: [
      { to: "/dashboard/observability", label: "Observability", icon: LineChart },
      { to: "/dashboard/logs", label: "Logs", icon: ScrollText },
      { to: "/dashboard/logs-explorer", label: "Logs Explorer", icon: Search },
      { to: "/dashboard/audit", label: "Audit trail", icon: ShieldAlert },
      { to: "/dashboard/audit-log", label: "Audit log", icon: ShieldAlert },
      { to: "/dashboard/pluto-audit", label: "Pluto Audit", icon: History },
      { to: "/dashboard/scaling", label: "Scaling", icon: Waves },
      { to: "/dashboard/usage", label: "Usage & Quotas", icon: Gauge },
      { to: "/dashboard/pluto-billing", label: "Billing & Alerts", icon: Gauge },
    ],
  },
  {
    label: "Platform",
    items: [
      { to: "/dashboard/projects", label: "Projects & Keys", icon: KeyRound },
      { to: "/dashboard/workspaces", label: "Workspaces", icon: Building2 },
      { to: "/dashboard/cors", label: "CORS whitelist", icon: Globe },
      { to: "/dashboard/backups", label: "Backups", icon: Archive },
      { to: "/dashboard/pluto-backups", label: "Pluto Backups", icon: Archive },
      { to: "/dashboard/branching", label: "Branching & Studio", icon: GitBranch },
      { to: "/dashboard/pluto-branches", label: "Branches", icon: GitBranch },
      { to: "/dashboard/pluto-replicas", label: "Read Replicas", icon: Globe },
      { to: "/dashboard/pluto-compliance", label: "Compliance (GDPR)", icon: ShieldCheck },
      { to: "/dashboard/pluto-vault", label: "Vault & Secrets", icon: LockKeyhole },
      { to: "/dashboard/enterprise", label: "Enterprise", icon: Globe },
      { to: "/dashboard/pluto-marketplace", label: "Marketplace", icon: ShoppingBag },
    ],
  },
  {
    label: "Developer",
    items: [
      { to: "/dashboard/pluto-sdk", label: "CLI & SDK", icon: Terminal },
      { to: "/dashboard/sdk-demo", label: "SDK Demo", icon: Zap },
      { to: "/dashboard/devex", label: "DevEx", icon: Package },
      { to: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

export function Sidebar() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, signOut } = useAuth();

  // Auto-expand the group that contains the active route so users land on
  // context after a page load.
  const initialOpen = new Set<string>();
  for (const g of groups) {
    if (g.items.some((i) => pathname === i.to || (i.to !== "/dashboard" && pathname.startsWith(i.to)))) {
      initialOpen.add(g.label);
    }
  }
  if (initialOpen.size === 0) initialOpen.add("Overview");
  const [open, setOpen] = useState<Set<string>>(initialOpen);

  const toggle = (label: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  };

  return (
    <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-border bg-card">
      <div className="flex items-center gap-2 px-5 py-5 border-b border-border">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <Zap className="h-4 w-4" />
        </div>
        <div>
          <div className="text-sm font-semibold tracking-tight">Pluto BaaS</div>
          <div className="text-[11px] text-muted-foreground">Admin Console</div>
        </div>
      </div>

      <WorkspaceSwitcher />

      <nav className="flex-1 px-2 py-3 space-y-1 overflow-y-auto">
        {groups.map((g) => {
          const isOpen = open.has(g.label);
          return (
            <div key={g.label}>
              <button
                type="button"
                onClick={() => toggle(g.label)}
                className="flex w-full items-center justify-between rounded-md px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground"
              >
                <span>{g.label}</span>
                <ChevronDown className={`h-3 w-3 transition-transform ${isOpen ? "" : "-rotate-90"}`} />
              </button>
              {isOpen && (
                <div className="mt-0.5 space-y-0.5">
                  {g.items.map(({ to, label, icon: Icon }) => {
                    const active =
                      pathname === to || (to !== "/dashboard" && pathname.startsWith(to));
                    return (
                      <Link
                        key={to}
                        to={to}
                        className={
                          "flex items-center gap-2.5 rounded-md px-3 py-1.5 text-sm transition-colors " +
                          (active
                            ? "bg-accent text-accent-foreground font-medium"
                            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground")
                        }
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </nav>

      <div className="border-t border-border p-3">
        <div className="px-2 pb-2 text-xs text-muted-foreground truncate">
          {session?.user?.email ?? "—"}
        </div>
        <button
          onClick={() => signOut()}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
