import { redirect } from "next/navigation";

/** Cities and kitchens now have their own pages. */
export default function OpsNetworkPage() {
  redirect("/ops/cities");
}
