import type { PageHelp } from "@/lib/help/types";

// /dashboard/pluto-orgs — organizations and teams (multi-tenant end-user grouping).
export const dashboardPlutoOrgsHelp: PageHelp = {
  slug: "dashboard.pluto-orgs",
  page: {
    title: { bn: "Organizations & Teams", en: "Organizations & teams" },
    whatItDoes: {
      bn: "এই পেইজ থেকে end-user-দের organization (company/tenant) এবং তাদের ভিতরে team তৈরি ও manage করা যায় — B2B SaaS-এ প্রতি customer-এর নিজস্ব org থাকে।",
      en: "Create and manage end-user organizations (companies/tenants) and the teams inside them — every B2B SaaS customer typically gets its own org.",
    },
    whyItMatters: {
      bn: "B2B app-এ data প্রতি org-এর ভিতরে isolate রাখতে হয়, member invite করতে হয়, seat count track করতে হয় — সবকিছু এক জায়গায়।",
      en: "In B2B apps you must isolate data per org, invite members, and track seats — all in one place here.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: {
        bn: "বামে org list, ডানে সিলেক্টেড org-এর detail — members, teams, invites, billing plan।",
        en: "Org list on the left, right pane shows selected org's members, teams, invites, and billing plan.",
      },
    },
    {
      id: "create-org",
      title: { bn: "Organization তৈরি", en: "Creating an organization" },
      whatItDoes: {
        bn: "'+ New org' চেপে name + slug + owner দিলে org তৈরি হবে; owner auto-admin role পাবে।",
        en: "'+ New org' takes name + slug + owner; the owner is auto-added as admin.",
      },
      howToUse: [
        { bn: "ধাপ ১: '+ New org' চাপুন।", en: "Step 1: click '+ New org'." },
        { bn: "ধাপ ২: name (display), slug (URL-safe), owner email দিন।", en: "Step 2: enter name (display), slug (URL-safe), owner email." },
        { bn: "ধাপ ৩: 'Create' → org list-এ appear করবে এবং owner-কে invite email যাবে।", en: "Step 3: 'Create' — org appears in the list and owner gets an invite email." },
      ],
    },
    {
      id: "invite-member",
      title: { bn: "Member invite ও role", en: "Inviting members & assigning roles" },
      whatItDoes: {
        bn: "প্রতিটা org-এর member-দের role হতে পারে owner / admin / member। Owner শুধু org-level setting বদলাতে পারে।",
        en: "Members can be owner / admin / member. Only owners change org-level settings.",
      },
      howToUse: [
        { bn: "ধাপ ১: org select করুন → 'Members' tab → '+ Invite'।", en: "Step 1: pick org → 'Members' tab → '+ Invite'." },
        { bn: "ধাপ ২: email + role দিয়ে 'Send'।", en: "Step 2: enter email + role, hit 'Send'." },
        { bn: "ধাপ ৩: pending invite 'Invites' sub-tab-এ থাকবে — resend/cancel করা যাবে।", en: "Step 3: pending invites live in the 'Invites' sub-tab — resend/cancel there." },
        { bn: "ধাপ ৪: existing member-এর role বদলাতে row-এর dropdown ব্যবহার করুন।", en: "Step 4: change an existing role via the row dropdown." },
      ],
    },
    {
      id: "teams",
      title: { bn: "Team তৈরি", en: "Creating teams" },
      whatItDoes: {
        bn: "একটা org-এর ভিতরে multiple team (Engineering, Sales, ইত্যাদি) থাকতে পারে; team-এর নিজস্ব member subset থাকে।",
        en: "An org can hold multiple teams (Engineering, Sales, etc.), each with its own member subset.",
      },
      howToUse: [
        { bn: "ধাপ ১: 'Teams' tab → '+ New team' → name দিন।", en: "Step 1: 'Teams' tab → '+ New team' → give it a name." },
        { bn: "ধাপ ২: team select → 'Add member' → org member list থেকে বাছাই।", en: "Step 2: select the team → 'Add member' → pick from org member list." },
      ],
    },
    {
      id: "isolation",
      title: { bn: "Data isolation (RLS)", en: "Data isolation (RLS)" },
      whatItDoes: {
        bn: "প্রতিটা row-এ `org_id` column রাখুন এবং RLS policy দিয়ে `org_id = auth.org_id()` set করুন — তাহলে data cross-org leak হবে না।",
        en: "Add `org_id` to each table and use an RLS policy `org_id = auth.org_id()` — data can't leak across orgs.",
      },
      troubleshooting: [
        {
          problem: { bn: "User একাধিক org-এ আছে, কোনটার data দেখবে?", en: "User is in multiple orgs — which data shows?" },
          solution: { bn: "Client app-এ 'active org' switcher দিন এবং JWT-এ `active_org` claim যোগ করুন।", en: "Add an 'active org' switcher in your app and include an `active_org` claim in the JWT." },
        },
      ],
    },
  ],
  glossary: [
    { term: "org", definition: { bn: "একটা tenant/company — নিজস্ব member ও data namespace।", en: "A tenant/company with its own members and data namespace." } },
    { term: "seat", definition: { bn: "একটা paid member slot; billing plan seat count-এ limit করে।", en: "One paid member slot; the billing plan caps seat count." } },
  ],
};
