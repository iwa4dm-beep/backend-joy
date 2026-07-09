import type { PageHelp } from "@/lib/help/types";

export const dashboardSettingsHelp: PageHelp = {
  slug: "dashboard.settings",
  page: {
    title: { bn: "সেটিংস", en: "Settings" },
    whatItDoes: {
      bn: "Backend URL, SMTP, storage driver এবং JWT rotation সহ dashboard-level configuration এক জায়গায়।",
      en: "Dashboard-level configuration in one place: backend URL, SMTP, storage driver, and JWT rotation.",
    },
    whyItMatters: {
      bn: "এই values ভুল হলে email/storage/auth সব surface fail করবে; centralized settings drift কমায়।",
      en: "Wrong values here break email, storage, and auth surfaces; centralized settings reduce drift.",
    },
  },
  sections: [
    {
      id: "backend",
      title: { bn: "Backend URL", en: "Backend URL" },
      whatItDoes: { bn: "Dashboard যে Pluto backend-এ কথা বলবে সেটার base URL।", en: "Base URL of the Pluto backend this dashboard talks to." },
    },
    {
      id: "smtp",
      title: { bn: "SMTP configuration", en: "SMTP configuration" },
      whatItDoes: { bn: "Password reset ও notification email পাঠানোর জন্য SMTP host, port, user।", en: "SMTP host, port, and user for password reset and notification email." },
      troubleshooting: [
        { problem: { bn: "Email যাচ্ছে না", en: "Emails not delivered" }, solution: { bn: "Provider dashboard-এ SPF/DKIM check করুন এবং port 587 (STARTTLS) চেষ্টা করুন।", en: "Check SPF/DKIM at the provider and try port 587 (STARTTLS)." } },
      ],
    },
    {
      id: "storage",
      title: { bn: "Storage driver", en: "Storage driver" },
      whatItDoes: { bn: "Local disk বা S3 (bucket + region) বেছে নিন।", en: "Choose local disk or S3 (bucket + region)." },
    },
    {
      id: "jwt",
      title: { bn: "JWT rotation", en: "JWT rotation" },
      whatItDoes: { bn: "Last rotation timestamp দেখুন এবং প্রয়োজন হলে key rotate করুন।", en: "See the last rotation timestamp and rotate the key when needed." },
    },
  ],
};
