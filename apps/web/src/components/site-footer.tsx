import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="mt-20 border-t border-line bg-paper-deep">
      <div className="container-page grid gap-8 py-12 md:grid-cols-4">
        <div className="md:col-span-2">
          <p className="font-display text-2xl font-extrabold text-jaggery">Food-Del</p>
          <p className="mt-2 max-w-sm text-sm text-ink-soft">
            Iconic sweets and specialities, made to order in their home city and shipped in
            cold-chain packaging to arrive fresh — on the day you choose.
          </p>
        </div>
        <div>
          <h2 className="mb-3 font-sans text-sm font-bold uppercase tracking-wider text-ink">
            Shop
          </h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li>
              <Link href="/from/kolkata" className="hover:text-jaggery">
                From Kolkata
              </Link>
            </li>
            <li>
              <Link href="/from/hyderabad" className="hover:text-jaggery">
                From Hyderabad
              </Link>
            </li>
            <li>
              <Link href="/from/delhi-ncr" className="hover:text-jaggery">
                From Delhi NCR
              </Link>
            </li>
            <li>
              <Link href="/from/bengaluru" className="hover:text-jaggery">
                From Bengaluru
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <h2 className="mb-3 font-sans text-sm font-bold uppercase tracking-wider text-ink">
            Help
          </h2>
          <ul className="space-y-2 text-sm text-ink-soft">
            <li>
              <Link href="/how-it-works" className="hover:text-jaggery">
                How fresh delivery works
              </Link>
            </li>
            <li>
              <Link href="/orders" className="hover:text-jaggery">
                Track an order
              </Link>
            </li>
            <li>
              <Link href="/vendor" className="hover:text-jaggery">
                For kitchens
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-line">
        <p className="container-page py-4 text-xs text-ink-muted">
          All food sold is prepared by FSSAI-licensed kitchens; each product page lists the licence
          number. Prices include GST.
        </p>
      </div>
    </footer>
  );
}
