import "server-only";

import { Resend } from "resend";

import { EMAIL_FROM, RESEND_API_KEY } from "@/lib/env";

export type SendResult = { ok: true } | { ok: false; error: string };

export type EmailPayload = {
  to: string;
  subject: string;
  html: string;
  text: string;
};

let client: Resend | null = null;

function api(): Resend | null {
  if (!RESEND_API_KEY) return null;
  if (!client) client = new Resend(RESEND_API_KEY);
  return client;
}

/**
 * Sends one transactional email through Resend. Returns a result instead of
 * throwing: callers decide whether a failed send is fatal (nothing does today —
 * the password-reset flow falls back to the server log so it stays testable).
 */
export async function sendEmail(payload: EmailPayload): Promise<SendResult> {
  const resend = api();
  if (!resend) {
    return { ok: false, error: "RESEND_API_KEY is not set" };
  }

  try {
    const { error } = await resend.emails.send({ from: EMAIL_FROM, ...payload });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "Unknown send error" };
  }
}

/**
 * Password-reset email. One clear action, the raw URL as a fallback for
 * clients that strip buttons, and an explicit note for people who did not
 * ask for it.
 */
export function passwordResetEmail(url: string): {
  subject: string;
  html: string;
  text: string;
} {
  const safeUrl = url.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  return {
    subject: "Reset your Freedemy password",
    text: [
      "Someone asked to reset the password for your Freedemy account.",
      "",
      "Choose a new password here (the link works once and expires in an hour):",
      url,
      "",
      "If you didn't request this, you can ignore this email — your password stays unchanged.",
    ].join("\n"),
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:0;background:#f4f4f7;font-family:ui-sans-serif,system-ui,-apple-system,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f7;padding:32px 12px;">
      <tr><td align="center">
        <table role="presentation" width="100%" style="max-width:440px;background:#ffffff;border-radius:16px;border:1px solid #e5e7eb;overflow:hidden;">
          <tr><td style="padding:28px 28px 8px 28px;">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:#4f46e5;">Freedemy</p>
            <h1 style="margin:12px 0 0 0;font-size:20px;line-height:1.3;">Reset your password</h1>
            <p style="margin:12px 0 0 0;font-size:14px;line-height:1.6;color:#4b5563;">
              Someone asked to reset the password for your Freedemy account. Pick a new one with the button below — the link works once and expires in an hour.
            </p>
          </td></tr>
          <tr><td style="padding:20px 28px 4px 28px;">
            <a href="${safeUrl}" style="display:inline-block;background:#4f46e5;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;padding:12px 22px;border-radius:10px;">Choose a new password</a>
          </td></tr>
          <tr><td style="padding:16px 28px 28px 28px;">
            <p style="margin:0;font-size:12px;line-height:1.6;color:#6b7280;">
              Button not working? Paste this into your browser:<br/>
              <a href="${safeUrl}" style="color:#4f46e5;word-break:break-all;">${safeUrl}</a>
            </p>
            <p style="margin:16px 0 0 0;font-size:12px;line-height:1.6;color:#9ca3af;">
              Didn&rsquo;t request this? You can safely ignore this email — your password stays unchanged.
            </p>
          </td></tr>
        </table>
      </td></tr>
    </table>
  </body>
</html>`,
  };
}
