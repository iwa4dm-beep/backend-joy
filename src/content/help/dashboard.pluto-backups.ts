import type { PageHelp } from "@/lib/help/types";

// Pluto Backups is a legacy alias that redirects to /dashboard/backups.
// Kept in the registry so ⌘K search still lands users on the right page.
export const dashboardPlutoBackupsHelp: PageHelp = {
  slug: "dashboard.pluto-backups",
  page: {
    title: { bn: "Pluto Backups (alias)", en: "Pluto Backups (alias)" },
    whatItDoes: {
      bn: "এটি `/dashboard/backups` পেইজের পুরনো নাম — click করলে সেখানে redirect হবে।",
      en: "This is the legacy alias for `/dashboard/backups` — clicking it redirects there.",
    },
    whyItMatters: {
      bn: "পুরনো bookmark ও sidebar link ভেঙে না ফেলার জন্য alias রাখা হয়েছে; আসল help কন্টেন্ট Backups পেইজে।",
      en: "The alias exists so old bookmarks and sidebar links keep working; the real help lives on the Backups page.",
    },
  },
  sections: [
    {
      id: "redirect",
      title: { bn: "কোথায় গেল?", en: "Where does it go?" },
      whatItDoes: {
        bn: "Backups, snapshots ও restore workflow-এর সম্পূর্ণ ডকুমেন্টেশনের জন্য `/dashboard/backups` দেখুন।",
        en: "See `/dashboard/backups` for the full backups, snapshots, and restore workflow documentation.",
      },
    },
  ],
};
