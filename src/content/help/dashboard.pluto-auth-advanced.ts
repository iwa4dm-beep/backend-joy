import type { PageHelp } from "@/lib/help/types";

// /dashboard/pluto-auth-advanced — OAuth providers, WebAuthn, SAML/OIDC SSO.
export const dashboardPlutoAuthAdvancedHelp: PageHelp = {
  slug: "dashboard.pluto-auth-advanced",
  page: {
    title: { bn: "Advanced Auth — OAuth, WebAuthn, SSO", en: "Advanced auth — OAuth, WebAuthn, SSO" },
    whatItDoes: {
      bn: "এই পেইজ থেকে external identity provider (Google, GitHub, Apple, Microsoft) OAuth, passwordless WebAuthn/Passkey, এবং enterprise SSO (SAML 2.0, OIDC) enable/configure করা যায়।",
      en: "Enable and configure external identity providers (Google, GitHub, Apple, Microsoft) OAuth, passwordless WebAuthn/Passkey, and enterprise SSO (SAML 2.0, OIDC).",
    },
    whyItMatters: {
      bn: "End-user-দের 'Sign in with Google' বা enterprise customer-দের 'Login with Okta' — এসব এক পেইজ থেকেই সেট করা যায় কোনো code লিখতে ছাড়া।",
      en: "Turn on 'Sign in with Google' for end-users or 'Login with Okta' for enterprise buyers — no code needed.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: {
        bn: "তিনটা tab — 'OAuth providers', 'WebAuthn / Passkey', 'SSO (SAML/OIDC)'। প্রতিটায় enable toggle এবং credential form।",
        en: "Three tabs — 'OAuth providers', 'WebAuthn / Passkey', 'SSO (SAML/OIDC)'. Each has an enable toggle and a credential form.",
      },
    },
    {
      id: "oauth",
      title: { bn: "OAuth provider যোগ করা", en: "Adding an OAuth provider" },
      whatItDoes: {
        bn: "Provider-এর client_id এবং client_secret দিলে callback URL auto-generate হবে; সেটা provider dashboard-এ paste করতে হবে।",
        en: "Enter provider client_id + client_secret; the callback URL is auto-generated to paste into the provider dashboard.",
      },
      howToUse: [
        { bn: "ধাপ ১: 'OAuth providers' tab → Google/GitHub/Apple/Microsoft-এর কার্ডে toggle on।", en: "Step 1: 'OAuth providers' tab → toggle on Google/GitHub/Apple/Microsoft." },
        { bn: "ধাপ ২: Provider-এর developer console-এ গিয়ে OAuth app তৈরি করুন।", en: "Step 2: create an OAuth app in the provider's developer console." },
        { bn: "ধাপ ৩: এখানে দেখানো callback URL সেখানে 'Authorized redirect URI'-তে paste করুন।", en: "Step 3: paste the shown callback URL into the provider's 'Authorized redirect URI'." },
        { bn: "ধাপ ৪: client_id + secret এখানে ফিরিয়ে এনে 'Save' চাপুন।", en: "Step 4: bring client_id + secret back here and click 'Save'." },
        { bn: "ধাপ ৫: 'Test flow' চাপে incognito window-এ verify করুন।", en: "Step 5: 'Test flow' in an incognito window to verify." },
      ],
      troubleshooting: [
        {
          problem: { bn: "'redirect_uri_mismatch'", en: "'redirect_uri_mismatch'" },
          solution: { bn: "Provider dashboard-এর URI hubbub একদম identical কিনা check করুন (trailing slash, protocol)।", en: "Verify the provider URI matches exactly (trailing slash, protocol)." },
        },
      ],
    },
    {
      id: "webauthn",
      title: { bn: "WebAuthn / Passkey", en: "WebAuthn / Passkey" },
      whatItDoes: {
        bn: "User Touch ID, Face ID, Windows Hello, বা hardware key দিয়ে password ছাড়াই sign-in করতে পারবে।",
        en: "Users sign in with Touch ID, Face ID, Windows Hello, or a hardware key — no password.",
      },
      howToUse: [
        { bn: "ধাপ ১: 'WebAuthn' tab → toggle on।", en: "Step 1: 'WebAuthn' tab → toggle on." },
        { bn: "ধাপ ২: RP name (আপনার app নাম) এবং RP ID (domain) set করুন।", en: "Step 2: set RP name (your app) and RP ID (domain)." },
        { bn: "ধাপ ৩: 'Save' চাপুন → client-এ WebAuthn button auto available হবে।", en: "Step 3: 'Save' — the WebAuthn button becomes available client-side." },
      ],
    },
    {
      id: "sso",
      title: { bn: "SSO (SAML 2.0 / OIDC)", en: "SSO (SAML 2.0 / OIDC)" },
      whatItDoes: {
        bn: "Enterprise customer-দের নিজস্ব IdP (Okta, Azure AD, Google Workspace) দিয়ে login।",
        en: "Enterprise customers log in via their own IdP (Okta, Azure AD, Google Workspace).",
      },
      howToUse: [
        { bn: "ধাপ ১: 'SSO' tab → '+ Add connection' → SAML বা OIDC বাছাই।", en: "Step 1: 'SSO' tab → '+ Add connection' → pick SAML or OIDC." },
        { bn: "ধাপ ২: SAML হলে IdP metadata XML upload; OIDC হলে discovery URL।", en: "Step 2: SAML → upload IdP metadata XML; OIDC → paste discovery URL." },
        { bn: "ধাপ ৩: Domain (যেমন `@acme.com`) map করুন — সেই domain-এর email দিয়ে login হলে auto SSO redirect হবে।", en: "Step 3: map a domain (e.g. `@acme.com`) — sign-ins from that domain auto-redirect via SSO." },
        { bn: "ধাপ ৪: 'Test SSO' চাপে verify।", en: "Step 4: 'Test SSO' to verify." },
      ],
    },
  ],
  glossary: [
    { term: "OAuth", definition: { bn: "External provider দিয়ে third-party sign-in-এর protocol।", en: "Protocol for third-party sign-in through an external provider." } },
    { term: "WebAuthn", definition: { bn: "Browser-native passwordless auth (biometric / hardware key)।", en: "Browser-native passwordless auth (biometric / hardware key)." } },
    { term: "IdP", definition: { bn: "Identity Provider — যে system user identity manage করে।", en: "Identity Provider — the system that owns user identity." } },
  ],
};
