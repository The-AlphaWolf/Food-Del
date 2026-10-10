import type { VendorDetail } from "@food-del/domain/contracts";
import { ItemGrid } from "@/components/item-card";
import { PincodePrompt } from "@/components/pincode-prompt";

export function KitchenView({ v, pincode }: { v: VendorDetail; pincode?: string }) {
  return (
    <>
      <section className="paper-grain border-b border-line">
        <div className="container-page py-12">
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-jaggery">
            {v.city.name}
            {v.establishedYear ? ` · since ${v.establishedYear}` : ""}
          </p>
          <h1 className="text-4xl font-extrabold md:text-5xl">{v.name}</h1>
          {v.tagline && <p className="mt-2 text-lg text-ink-soft">{v.tagline}</p>}
          {v.story && <p className="mt-4 max-w-2xl text-ink-soft">{v.story}</p>}
        </div>
      </section>
      <div className="container-page py-10">
        <PincodePrompt initial={pincode ?? null} />
        <ItemGrid items={v.items} context="kitchen" />
      </div>
    </>
  );
}
