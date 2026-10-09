import { z } from "zod";
import { Instant, Pincode, RoleSchema } from "./common";

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
