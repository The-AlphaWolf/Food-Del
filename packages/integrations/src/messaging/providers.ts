import { requestJson } from "../http";
import type { Channel, Notifier, OutboundMessage, SendResult } from "./types";

/** Development notifier: prints to the console and keeps a log for tests. */
export class RecordingNotifier implements Notifier {
  readonly sent: OutboundMessage[] = [];
  constructor(private readonly echo = false) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    this.sent.push(message);
    if (this.echo) console.info(`[${message.channel} → ${message.to}] ${message.body}`);
    return { providerRef: `dev-${this.sent.length}` };
  }
}

/** MSG91 Flow API (DLT-registered templates). `templateIds` maps our keys to flow ids. */
export class Msg91Sms implements Notifier {
  constructor(
    private readonly config: {
      authKey: string;
      templateIds: Record<string, string>;
      fetch?: typeof fetch;
    },
  ) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const templateId = this.config.templateIds[message.template];
    if (!templateId) throw new Error(`msg91: no DLT template for "${message.template}"`);
    const vars = Object.fromEntries(message.params.map((p, i) => [`var${i + 1}`, p]));
    const r = await requestJson<{ message?: string; request_id?: string }>(
      "msg91",
      "https://control.msg91.com/api/v5/flow/",
      {
        headers: { authkey: this.config.authKey },
        body: {
          template_id: templateId,
          short_url: "0",
          recipients: [{ mobiles: message.to.replace(/^\+/, ""), ...vars }],
        },
      },
      this.config.fetch,
    );
    return { providerRef: r.request_id ?? r.message ?? null };
  }
}

/** WhatsApp Cloud API with pre-approved utility templates. */
export class WhatsAppCloud implements Notifier {
  constructor(
    private readonly config: {
      accessToken: string;
      phoneNumberId: string;
      templateNames: Record<string, string>;
      languageCode?: string;
      apiVersion?: string;
      fetch?: typeof fetch;
    },
  ) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const name = this.config.templateNames[message.template];
    if (!name) throw new Error(`whatsapp: no approved template for "${message.template}"`);
    const r = await requestJson<{ messages?: { id: string }[] }>(
      "whatsapp",
      `https://graph.facebook.com/${this.config.apiVersion ?? "v21.0"}/${this.config.phoneNumberId}/messages`,
      {
        headers: { Authorization: `Bearer ${this.config.accessToken}` },
        body: {
          messaging_product: "whatsapp",
          to: message.to.replace(/^\+/, ""),
          type: "template",
          template: {
            name,
            language: { code: this.config.languageCode ?? "en" },
            components: [
              { type: "body", parameters: message.params.map((text) => ({ type: "text", text })) },
            ],
          },
        },
      },
      this.config.fetch,
    );
    return { providerRef: r.messages?.[0]?.id ?? null };
  }
}

/** Transactional email via Resend. */
export class ResendEmail implements Notifier {
  constructor(private readonly config: { apiKey: string; from: string; fetch?: typeof fetch }) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const r = await requestJson<{ id?: string }>(
      "resend",
      "https://api.resend.com/emails",
      {
        headers: { Authorization: `Bearer ${this.config.apiKey}` },
        body: {
          from: this.config.from,
          to: [message.to],
          subject: message.subject ?? "Your Food-Del order",
          text: message.body,
        },
      },
      this.config.fetch,
    );
    return { providerRef: r.id ?? null };
  }
}

/** Routes each message to the notifier configured for its channel; unconfigured channels are skipped. */
export class ChannelRouter implements Notifier {
  constructor(private readonly routes: Partial<Record<Channel, Notifier>>) {}

  async send(message: OutboundMessage): Promise<SendResult> {
    const target = this.routes[message.channel];
    if (!target) return { providerRef: null };
    return target.send(message);
  }

  has(channel: Channel): boolean {
    return Boolean(this.routes[channel]);
  }
}
