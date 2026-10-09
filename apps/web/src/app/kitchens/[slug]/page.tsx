import { DomainError } from "@food-del/core";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ItemGrid } from "@/components/item-card";
import { PincodePrompt } from "@/components/pincode-prompt";
import { currentPincode, getCore } from "@/server/data";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ slug: string }> };

async function load(slug: string, pincode?: string) {
  try {
    return await getCore().catalog.getVendor(slug, pincode);
  } catch (e) {
    if (e instanceof DomainError && e.status === 404) notFound();
    throw e;
  }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const v = await load((await params).slug);
  return { title: `${v.name}, ${v.city.name}`, description: v.tagline ?? undefined };
}

export default async function KitchenPage({ params }: Props) {
  const pincode = await currentPincode();
  const v = await load((await params).slug, pincode);
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
        <ItemGrid items={v.items} />
      </div>
    </>
  );
}
