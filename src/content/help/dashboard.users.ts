import type { PageHelp } from "@/lib/help/types";

// /dashboard/users — user management: sign-ups, verification, roles.
export const dashboardUsersHelp: PageHelp = {
  slug: "dashboard.users",
  page: {
    title: { bn: "Users — সাইন-আপ, ভেরিফিকেশন ও role", en: "Users — sign-ups, verification & roles" },
    whatItDoes: {
      bn: "এই পেইজ থেকে workspace-এর সব end-user (আপনার app-এ যারা sign-up করে) manage করা যায় — নতুন user invite, email verify, password reset, role বদলানো, ও user disable/delete সব এখানে।",
      en: "Manage every end-user of your workspace (the people signing up to your app) — invite, verify email, reset password, change role, and disable/delete accounts.",
    },
    whyItMatters: {
      bn: "Support ticket handle করা, spam account block করা, বা admin promote করা — সব এখান থেকেই SQL ছাড়া করা যায়।",
      en: "Handle support tickets, block spam accounts, or promote admins — all here, no SQL required.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: {
        bn: "উপরে search box + filter (verified/unverified/disabled), মাঝে user table (email, provider, last sign-in, role), ডানে row action menu।",
        en: "Search + filters (verified/unverified/disabled) on top, user table in the middle (email, provider, last sign-in, role), row action menu on the right.",
      },
    },
    {
      id: "invite",
      title: { bn: "User invite করা", en: "Inviting a user" },
      whatItDoes: {
        bn: "'Invite' চেপে email দিলে user-কে magic-link mail যাবে; sign-up হওয়ার সাথে সাথে row-এ appear করবে।",
        en: "'Invite' sends a magic-link email; the user shows up in the table as soon as they sign up.",
      },
      howToUse: [
        { bn: "ধাপ ১: উপরের '+ Invite' চাপুন।", en: "Step 1: click '+ Invite' up top." },
        { bn: "ধাপ ২: email + initial role (user/admin) দিন।", en: "Step 2: enter email + initial role (user/admin)." },
        { bn: "ধাপ ৩: 'Send invite' — magic link যাবে।", en: "Step 3: 'Send invite' — magic link is sent." },
        { bn: "ধাপ ৪: user click করলে auto sign-up হবে এবং row 'verified' status পাবে।", en: "Step 4: when the user clicks it they auto sign-up and the row goes 'verified'." },
      ],
    },
    {
      id: "manage",
      title: { bn: "User manage করা", en: "Managing a user" },
      whatItDoes: {
        bn: "প্রতিটা row-এর ⋯ menu-তে — Resend verification, Reset password, Change role, Disable, Delete।",
        en: "Row ⋯ menu — Resend verification, Reset password, Change role, Disable, Delete.",
      },
      howToUse: [
        { bn: "ধাপ ১: target user খুঁজে ⋯ চাপুন।", en: "Step 1: find the user and click ⋯." },
        { bn: "ধাপ ২: 'Reset password' → user-এর email-এ reset link যাবে।", en: "Step 2: 'Reset password' → link goes to their email." },
        { bn: "ধাপ ৩: 'Change role' → dropdown থেকে নতুন role।", en: "Step 3: 'Change role' → pick new role from dropdown." },
        { bn: "ধাপ ৪: 'Disable' → sign-in block হবে কিন্তু data থাকবে; 'Delete' → auth + related data cascade।", en: "Step 4: 'Disable' blocks sign-in but keeps data; 'Delete' cascades auth + related data." },
      ],
      troubleshooting: [
        {
          problem: { bn: "User email পাচ্ছে না", en: "User isn't getting emails" },
          solution: { bn: "SMTP config check করুন (Ops → Integrations); spam folder দেখতে বলুন।", en: "Check SMTP config (Ops → Integrations); ask them to check spam." },
        },
        {
          problem: { bn: "Delete করলেও reappear করছে", en: "Deleted user reappears" },
          solution: { bn: "Client app auto-signup allow করছে; /dashboard/pluto-auth-advanced-এ signup disable করুন।", en: "Your app allows auto-signup — disable it at /dashboard/pluto-auth-advanced." },
        },
      ],
    },
    {
      id: "audit",
      title: { bn: "Audit trail", en: "Audit trail" },
      whatItDoes: {
        bn: "প্রতিটা admin action (invite, role change, delete) audit log-এ যায় — /dashboard/audit-এ দেখা যাবে কে কখন কী করেছে।",
        en: "Every admin action (invite, role change, delete) is audit-logged — check /dashboard/audit to see who did what.",
      },
    },
  ],
  glossary: [
    { term: "magic link", definition: { bn: "One-time link যা click করলে password ছাড়াই sign-in হয়।", en: "One-time link that signs the user in without a password." } },
    { term: "provider", definition: { bn: "কোন method দিয়ে sign-up হয়েছে (email, Google, GitHub ইত্যাদি)।", en: "How the user signed up (email, Google, GitHub, etc.)." } },
  ],
};
