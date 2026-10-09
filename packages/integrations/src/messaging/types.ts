export type Channel = "SMS" | "WHATSAPP" | "EMAIL";

/**
 * A rendered message. Template keys map to provider-side templates (DLT template ids for SMS,
 * approved template names for WhatsApp); `params` fill their variables in order, and `body` is
 * the plain-text rendering used for email, logs and the dev console.
 */
export interface OutboundMessage {
  channel: Channel;
  to: string;
  template: string;
  params: string[];
  subject?: string;
  body: string;
}

export interface SendResult {
  providerRef: string | null;
}

export interface Notifier {
  send(message: OutboundMessage): Promise<SendResult>;
}
