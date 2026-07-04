// Phase 31 — Email transport abstraction.
//
// Two adapters: `console` writes to stdout (dev), `webhook` POSTs the
// message to $PLUTO_EMAIL_WEBHOOK_URL. Real SMTP / Resend / SendGrid
// plugs in by adding another adapter without touching call sites.

export type OutboundEmail = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  tag?: string; // e.g. "password-reset", "email-confirm"
};

export interface EmailProvider {
  name: string;
  send(msg: OutboundEmail): Promise<{ id: string }>;
}

class ConsoleEmailProvider implements EmailProvider {
  readonly name = "console";
  async send(msg: OutboundEmail) {
    // eslint-disable-next-line no-console
    console.log("[email:console]", JSON.stringify({ ...msg, html: undefined }, null, 2));
    return { id: `console_${Date.now().toString(36)}` };
  }
}

class WebhookEmailProvider implements EmailProvider {
  readonly name = "webhook";
  constructor(private readonly url: string, private readonly secret?: string) {}
  async send(msg: OutboundEmail) {
    const res = await fetch(this.url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.secret ? { "x-pluto-signature": this.secret } : {}),
      },
      body: JSON.stringify(msg),
    });
    if (!res.ok) throw new Error(`email_webhook_${res.status}`);
    const j = (await res.json().catch(() => ({}))) as { id?: string };
    return { id: j.id ?? `wh_${Date.now().toString(36)}` };
  }
}

let _provider: EmailProvider | null = null;
export function emailProvider(): EmailProvider {
  if (_provider) return _provider;
  const url = process.env.PLUTO_EMAIL_WEBHOOK_URL;
  _provider = url
    ? new WebhookEmailProvider(url, process.env.PLUTO_EMAIL_WEBHOOK_SECRET)
    : new ConsoleEmailProvider();
  return _provider;
}

// ---- Templates (plain-text; callers may wrap with HTML) ---------------

export function passwordResetEmail(link: string, ttlMinutes: number): OutboundEmail {
  return {
    to: "",
    subject: "Reset your password",
    tag: "password-reset",
    text: [
      "Someone (hopefully you) asked to reset your password.",
      `Open this link within ${ttlMinutes} minutes to choose a new one:`,
      link,
      "",
      "If you didn't request this, you can safely ignore this email.",
    ].join("\n"),
  };
}

export function emailConfirmEmail(link: string, ttlMinutes: number): OutboundEmail {
  return {
    to: "",
    subject: "Confirm your email address",
    tag: "email-confirm",
    text: [
      "Welcome! Please confirm your email address by opening the link below:",
      link,
      "",
      `The link expires in ${ttlMinutes} minutes.`,
    ].join("\n"),
  };
}
