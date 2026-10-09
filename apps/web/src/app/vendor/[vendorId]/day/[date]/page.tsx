import { STATIC_DEMO } from "@/lib/demo";
import { VendorDayPage } from "./screen";

/** IDs are created at runtime; the GitHub Pages export builds one placeholder (see 404 page). */
export async function generateStaticParams() {
  return STATIC_DEMO ? [{ vendorId: "_", date: "_" }] : [];
}

export default function Page() {
  return <VendorDayPage />;
}
