import "server-only";
import { isValidPincode } from "@food-del/domain";
import { cookies } from "next/headers";
import { getCore } from "./core";

/** The shopper's pincode from the cookie set by the pincode picker (validated). */
export async function currentPincode(): Promise<string | undefined> {
  const value = (await cookies()).get("fd_pin")?.value;
  return value && isValidPincode(value) ? value : undefined;
}

export { getCore };
