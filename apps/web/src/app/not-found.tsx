import { ButtonLink } from "@/components/ui/primitives";

export default function NotFound() {
  return (
    <div className="container-page flex flex-col items-center gap-4 py-24 text-center">
      <p className="text-sm font-bold uppercase tracking-[0.16em] text-jaggery">404</p>
      <h1 className="text-4xl font-extrabold">This page has gone stale</h1>
      <p className="max-w-md text-ink-soft">
        We couldn't find what you were looking for. The delicacies, happily, are still fresh.
      </p>
      <ButtonLink href="/search">Browse delicacies</ButtonLink>
    </div>
  );
}
