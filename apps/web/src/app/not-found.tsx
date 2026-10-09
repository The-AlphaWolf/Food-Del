import { DemoFallback } from "@/components/demo/fallback";
import { NotFoundView } from "@/components/not-found-view";
import { STATIC_DEMO } from "@/lib/demo";

export default function NotFound() {
  // GitHub Pages serves this page for any path it has no file for, including kitchens, orders
  // and delicacies created in the demo; the fallback renders those screens from the URL.
  return STATIC_DEMO ? <DemoFallback /> : <NotFoundView />;
}
