import { STATIC_DEMO } from "@/lib/demo";
import { NewItemPage } from "./screen";

/** IDs are created at runtime; the GitHub Pages export builds one placeholder (see 404 page). */
export async function generateStaticParams() {
  return STATIC_DEMO ? [{ id: "_" }] : [];
}

export default function Page() {
  return <NewItemPage />;
}
