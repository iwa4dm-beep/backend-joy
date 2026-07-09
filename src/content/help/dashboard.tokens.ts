import type { PageHelp } from "@/lib/help/types";

// /dashboard/tokens — API token issuance, rotation, revocation, scopes.
export const dashboardTokensHelp: PageHelp = {
  slug: "dashboard.tokens",
  page: {
    title: { bn: "API Tokens — issue, rotate, revoke", en: "API tokens — issue, rotate, revoke" },
    whatItDoes: {
      bn: "এই পেইজ থেকে Pluto workspace-এর API token (anon, authenticated, service_role, personal access token) mint, list, rotate এবং revoke করা যায়। প্রতিটা token-এর scope, expiry এবং last-used timestamp track হয়।",
      en: "Mint, list, rotate, and revoke API tokens (anon, authenticated, service_role, personal access) for the workspace. Each token tracks its scope, expiry, and last-used time.",
    },
    whyItMatters: {
      bn: "Client app, edge function, CI/CD pipeline, বা partner integration — সবাই এই token দিয়ে backend-এ পৌঁছায়। Rotate/revoke এখান থেকে না করলে leak হওয়া key চিরকাল valid থাকে।",
      en: "Client apps, edge functions, CI/CD, and partner integrations all reach the backend with these tokens. Without rotate/revoke here, a leaked key stays valid forever.",
    },
  },
  sections: [
    {
      id: "brief",
      title: { bn: "সংক্ষিপ্ত পরিচিতি", en: "Quick summary" },
      whatItDoes: {
        bn: "উপরে '+ Mint token', নিচে token list (name, role, prefix, last-used, expiry)। প্রতিটা row-এ Rotate ও Revoke বাটন।",
        en: "'+ Mint token' on top; token list below (name, role, prefix, last-used, expiry) with Rotate + Revoke per row.",
      },
    },
    {
      id: "mint",
      title: { bn: "Token mint করা", en: "Minting a token" },
      whatItDoes: {
        bn: "Name, role (anon/authenticated/service_role/personal), expiry, এবং optional scope দিলে token তৈরি হবে। Full value শুধু একবার দেখাবে।",
        en: "Enter name, role (anon/authenticated/service_role/personal), expiry, and optional scopes; the full value is shown once only.",
      },
      howToUse: [
        { bn: "ধাপ ১: '+ Mint token' চাপুন।", en: "Step 1: click '+ Mint token'." },
        { bn: "ধাপ ২: name দিন (কোথায় ব্যবহার হবে বোঝাতে — যেমন 'production edge function')।", en: "Step 2: name it after its use (e.g. 'production edge function')." },
        { bn: "ধাপ ৩: role বাছাই — client app-এর জন্য anon, backend job-এর জন্য service_role।", en: "Step 3: pick role — anon for client apps, service_role for backend jobs." },
        { bn: "ধাপ ৪: expiry set করুন (30/90/180 দিন recommend)।", en: "Step 4: set expiry (30/90/180 days recommended)." },
        { bn: "ধাপ ৫: 'Mint' → dialog-এ token দেখাবে; 'Copy' চেপে secret manager-এ save করুন।", en: "Step 5: 'Mint' — dialog shows the token; 'Copy' and store in a secret manager." },
        { bn: "ধাপ ৬: 'I saved it' টিক দিয়ে dialog close করুন।", en: "Step 6: tick 'I saved it' and close the dialog." },
      ],
    },
    {
      id: "rotate",
      title: { bn: "Rotate — নিয়মিত পুরনো token বদলানো", en: "Rotate — regularly replacing tokens" },
      whatItDoes: {
        bn: "Rotate পুরনো token revoke করে এবং একই name/role/scope-এ নতুন token mint করে। Deploy pipeline-এ new key roll করার জন্য।",
        en: "Rotate revokes the old token and mints a replacement with the same name/role/scope — useful for rolling keys in deploy pipelines.",
      },
      howToUse: [
        { bn: "ধাপ ১: row-এর 'Rotate' চাপুন।", en: "Step 1: click 'Rotate' on the row." },
        { bn: "ধাপ ২: confirmation-এ 'Yes, rotate' চাপুন।", en: "Step 2: confirm 'Yes, rotate'." },
        { bn: "ধাপ ৩: নতুন token dialog-এ দেখাবে — deploy-এ update করুন।", en: "Step 3: the new token appears — update it in your deploy." },
        { bn: "ধাপ ৪: পুরনো token তৎক্ষণাৎ fail করবে; deploy রুন rollout time মাথায় রেখে করুন।", en: "Step 4: the old token fails instantly — schedule the rollout accordingly." },
      ],
    },
    {
      id: "revoke",
      title: { bn: "Revoke — token বাতিল", en: "Revoke — kill a token" },
      whatItDoes: { bn: "Token leak-এর সন্দেহ হলে সাথে সাথে Revoke চাপুন — এটা irreversible।", en: "Suspect a leak? Revoke immediately — this is irreversible." },
      howToUse: [
        { bn: "ধাপ ১: row-এর trash icon চাপুন।", en: "Step 1: click the trash icon." },
        { bn: "ধাপ ২: 'Confirm revoke' → token সাথে সাথে dead।", en: "Step 2: 'Confirm revoke' — dead instantly." },
        { bn: "ধাপ ৩: /dashboard/audit-এ event log দেখুন কে revoke করেছে।", en: "Step 3: check /dashboard/audit for who revoked it." },
      ],
    },
    {
      id: "scopes",
      title: { bn: "Scope ও safe use", en: "Scopes & safe use" },
      whatItDoes: {
        bn: "Personal access token-এ specific scope (read:tables, write:tables, admin:migrations ইত্যাদি) দেওয়া যায় — যাতে token leak হলেও damage সীমিত।",
        en: "Personal access tokens can be scoped (read:tables, write:tables, admin:migrations …) so leaked tokens have limited blast radius.",
      },
      troubleshooting: [
        {
          problem: { bn: "service_role token client app-এ ব্যবহার করে ফেলেছি", en: "Used service_role in a client app by mistake" },
          solution: { bn: "সাথে সাথে Revoke করুন এবং নতুন anon token issue করে replace করুন। Audit log check করুন unauthorized access-এর জন্য।", en: "Revoke it immediately, replace with a fresh anon token, and audit for unauthorized access." },
        },
        {
          problem: { bn: "Token কাজ করছে না — 401", en: "Token not working — 401" },
          solution: { bn: "Expired কিনা list-এ দেখুন; header format `Authorization: Bearer <token>` কিনা confirm করুন।", en: "Check the list for expiry; confirm header is `Authorization: Bearer <token>`." },
        },
      ],
    },
  ],
  glossary: [
    { term: "PAT", definition: { bn: "Personal Access Token — individual user-এর scoped token।", en: "Personal Access Token — a scoped token tied to a single user." } },
    { term: "prefix", definition: { bn: "Token-এর প্রথম কয়েকটা character (list-এ identifier হিসেবে দেখানো হয়)।", en: "First few characters shown as an identifier in the list." } },
    { term: "scope", definition: { bn: "Token কী করতে পারবে তার সীমা।", en: "Limits on what a token can do." } },
  ],
};
