import type { PageHelp } from "@/lib/help/types";

// /dashboard/mfa — Multi-factor authentication (TOTP + recovery codes).
export const dashboardMfaHelp: PageHelp = {
  slug: "dashboard.mfa",
  page: {
    title: { bn: "MFA — Multi-factor authentication", en: "MFA — multi-factor authentication" },
    whatItDoes: {
      bn: "এই পেইজ workspace-এ TOTP (Google Authenticator, Authy) enrol/verify/disenrol এবং one-time recovery code issue/regenerate manage করে।",
      en: "Enrol / verify / disenrol TOTP (Google Authenticator, Authy) and issue / regenerate single-use recovery codes.",
    },
    whyItMatters: {
      bn: "Password চুরি হলেও MFA থাকলে account safe থাকে — production workspace-এ admin-দের MFA বাধ্যতামূলক করাই ভালো।",
      en: "Even if a password leaks, MFA keeps the account safe — make it mandatory for admins on production workspaces.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: {
        bn: "তিনটা section — 'Your MFA' (আপনার নিজের factor), 'Workspace policy' (কার MFA বাধ্যতামূলক), 'Recovery codes' (backup)।",
        en: "Three sections — 'Your MFA' (your own factors), 'Workspace policy' (who is required to enrol), 'Recovery codes' (backup).",
      },
    },
    {
      id: "enrol",
      title: { bn: "TOTP enrol করা", en: "Enrolling TOTP" },
      whatItDoes: {
        bn: "Authenticator app-এ QR scan করে ৬-digit code confirm করলে factor active হয়।",
        en: "Scan the QR in your authenticator app and confirm a 6-digit code to activate.",
      },
      howToUse: [
        { bn: "ধাপ ১: 'Your MFA' → 'Add TOTP' চাপুন।", en: "Step 1: 'Your MFA' → 'Add TOTP'." },
        { bn: "ধাপ ২: Authenticator app-এ QR scan করুন।", en: "Step 2: scan the QR in your authenticator app." },
        { bn: "ধাপ ৩: app-এর ৬-digit code type করে 'Verify'।", en: "Step 3: type the 6-digit code and 'Verify'." },
        { bn: "ধাপ ৪: এবার automatically recovery code দেখাবে — safe জায়গায় save করুন।", en: "Step 4: recovery codes appear — save them somewhere safe." },
        { bn: "ধাপ ৫: log out এবং আবার sign-in করে verify করুন।", en: "Step 5: log out and back in to verify." },
      ],
    },
    {
      id: "policy",
      title: { bn: "Workspace policy", en: "Workspace policy" },
      whatItDoes: {
        bn: "কার MFA বাধ্যতামূলক তা এখানে ঠিক করা যায় — Off / Admins only / Everyone।",
        en: "Choose who must enrol — Off / Admins only / Everyone.",
      },
      howToUse: [
        { bn: "ধাপ ১: 'Workspace policy' section-এ যান।", en: "Step 1: open 'Workspace policy'." },
        { bn: "ধাপ ২: mode বাছাই করুন → 'Save policy'।", en: "Step 2: pick mode → 'Save policy'." },
        { bn: "ধাপ ৩: Everyone করলে existing user-দের next sign-in-এ enrol করতে বলবে।", en: "Step 3: Everyone forces existing users to enrol on next sign-in." },
      ],
    },
    {
      id: "recovery",
      title: { bn: "Recovery codes", en: "Recovery codes" },
      whatItDoes: {
        bn: "Phone হারালে recovery code দিয়ে login করা যায়; প্রতিটা code একবার use হয়। কম হয়ে গেলে regenerate করুন।",
        en: "Log in with a recovery code if you lose your phone; each is single-use. Regenerate when low.",
      },
      howToUse: [
        { bn: "ধাপ ১: 'Recovery codes' → 'Regenerate' চাপুন।", en: "Step 1: 'Recovery codes' → 'Regenerate'." },
        { bn: "ধাপ ২: dialog-এ নতুন ১০টা code দেখাবে — download/print করুন।", en: "Step 2: dialog shows 10 new codes — download / print." },
        { bn: "ধাপ ৩: পুরনো code auto-invalid।", en: "Step 3: old codes auto-invalidate." },
      ],
      troubleshooting: [
        {
          problem: { bn: "Phone হারিয়ে গেছে, recovery code-ও নেই", en: "Phone lost, no recovery codes either" },
          solution: { bn: "অন্য admin-কে /dashboard/users থেকে আপনার MFA reset করতে বলুন।", en: "Ask another admin to reset your MFA from /dashboard/users." },
        },
        {
          problem: { bn: "Time-drift error ('invalid code')", en: "Time-drift error ('invalid code')" },
          solution: { bn: "Phone-এর time auto-sync on করুন; কয়েক সেকেন্ড আগে/পরে code চেষ্টা করুন।", en: "Enable auto-time on the phone; try codes from a few seconds before/after." },
        },
      ],
    },
  ],
  glossary: [
    { term: "TOTP", definition: { bn: "Time-based One-Time Password — প্রতি ৩০ সেকেন্ডে নতুন ৬-digit code।", en: "Time-based One-Time Password — a fresh 6-digit code every 30s." } },
    { term: "recovery code", definition: { bn: "Backup single-use code যা phone না থাকলে login-এ সাহায্য করে।", en: "Backup single-use code for logging in without the phone." } },
  ],
};
