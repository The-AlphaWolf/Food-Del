import { z } from "zod";
import { Instant, Pincode, RoleSchema } from "./common";
import { ShipToSchema } from "./orders";

export const OtpRequestSchema = z
  .object({ phone: z.string().trim().min(10).max(16) })
  .meta({ id: "OtpRequest" });

export const OtpResponseSchema = z
  .object({
    sent: z.literal(true),
    /** Only in development: the code to type in. */
    devCode: z.string().optional(),
  })
  .meta({ id: "OtpResponse" });

export const VerifyOtpRequestSchema = z
  .object({
    phone: z.string().trim().min(10).max(16),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/, "Enter the 6-digit code"),
  })
  .meta({ id: "VerifyOtpRequest" });

export const MeSchema = z
  .object({
    id: z.string(),
    phone: z.string().nullable(),
    fullName: z.string().nullable(),
    email: z.string().nullable(),
    roles: z.array(RoleSchema),
    vendors: z.array(z.object({ id: z.string(), slug: z.string(), name: z.string() })),
    /** The privacy notice version this person last acknowledged, if any. */
    privacyNoticeAcknowledged: z.string().nullable(),
  })
  .meta({ id: "Me" });
export type Me = z.infer<typeof MeSchema>;

export const SessionSchema = z
  .object({ token: z.string(), expiresAt: Instant, user: MeSchema })
  .meta({ id: "Session" });
export type Session = z.infer<typeof SessionSchema>;

export const UpdateMeRequestSchema = z
  .object({
    fullName: z.string().trim().min(2).max(80).optional(),
    email: z.email().optional(),
  })
  .meta({ id: "UpdateMeRequest" });

export const AddressInputSchema = z
  .object({
    label: z.string().trim().max(30).nullable().optional(),
    recipientName: z.string().trim().min(2).max(80),
    phone: z.string().trim().min(10).max(16),
    line1: z.string().trim().min(3).max(160),
    line2: z.string().trim().max(160).nullable().optional(),
    landmark: z.string().trim().max(120).nullable().optional(),
    pincode: Pincode,
    isDefault: z.boolean().optional(),
  })
  .meta({ id: "AddressInput" });
export type AddressInput = z.infer<typeof AddressInputSchema>;

export const AddressSchema = AddressInputSchema.extend({
  id: z.string(),
  cityName: z.string(),
  stateCode: z.string(),
  isDefault: z.boolean(),
}).meta({ id: "Address" });
export type Address = z.infer<typeof AddressSchema>;

export const AcknowledgeNoticeRequestSchema = z
  .object({ version: z.string().max(20) })
  .meta({ id: "AcknowledgeNoticeRequest" });

export const DeleteAccountRequestSchema = z
  .object({
    /** Typed by the person to confirm; guards against accidental calls. */
    confirm: z.literal("DELETE"),
  })
  .meta({ id: "DeleteAccountRequest" });

export const PrivacyEventSchema = z.object({
  kind: z.enum(["NOTICE_ACKNOWLEDGED", "DATA_EXPORTED", "ACCOUNT_DELETED"]),
  noticeVersion: z.string().nullable(),
  at: Instant,
});

/** Everything we hold about a person, as one JSON download (DPDP right to access). */
export const DataExportSchema = z
  .object({
    generatedAt: Instant,
    about: z.string(),
    profile: z.object({
      id: z.string(),
      phone: z.string().nullable(),
      email: z.string().nullable(),
      fullName: z.string().nullable(),
      createdAt: Instant,
    }),
    addresses: z.array(AddressSchema),
    orders: z.array(
      z.object({
        orderNumber: z.string(),
        status: z.string(),
        placedAt: Instant.nullable(),
        shipTo: ShipToSchema,
        gift: z.object({ message: z.string().nullable(), senderName: z.string().nullable() }),
        grandTotalPaise: z.number().int(),
        items: z.array(
          z.object({ name: z.string(), quantity: z.number().int(), lineTotalPaise: z.number() }),
        ),
        parcels: z.array(
          z.object({
            status: z.string(),
            dispatchDate: z.string(),
            awbNumber: z.string().nullable(),
            deliveredAt: Instant.nullable(),
          }),
        ),
        payments: z.array(
          z.object({
            status: z.string(),
            amountPaise: z.number().int(),
            method: z.string().nullable(),
            capturedAt: Instant.nullable(),
          }),
        ),
      }),
    ),
    claims: z.array(
      z.object({
        orderNumber: z.string(),
        kind: z.string(),
        description: z.string(),
        status: z.string(),
        refundPaise: z.number().int(),
        createdAt: Instant,
      }),
    ),
    messages: z.array(
      z.object({
        channel: z.string(),
        recipient: z.string(),
        template: z.string(),
        body: z.string(),
        sentAt: Instant,
      }),
    ),
    privacyHistory: z.array(PrivacyEventSchema),
  })
  .meta({ id: "DataExport" });
export type DataExport = z.infer<typeof DataExportSchema>;
