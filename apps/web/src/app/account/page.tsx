"use client";

import { queryKeys, useMe } from "@food-del/api-client/react";
import { PRIVACY_NOTICE_VERSION } from "@food-del/domain";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, LogOut, ShieldCheck, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireSession } from "@/components/require-session";
import { useToast } from "@/components/toast";
import { Dialog } from "@/components/ui/dialog";
import { Button, Card, Field, Input } from "@/components/ui/primitives";
import { api } from "@/lib/api";
import { logout } from "@/lib/auth";
import { session } from "@/lib/session";

function Account() {
  const me = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const addresses = useQuery({ queryKey: queryKeys.addresses, queryFn: api.addresses });
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  useEffect(() => {
    if (me.data) {
      setName(me.data.fullName ?? "");
      setEmail(me.data.email ?? "");
      session.setUser(me.data);
    }
  }, [me.data]);
  const save = useMutation({
    mutationFn: () => api.updateMe({ fullName: name || undefined, email: email || undefined }),
    onSuccess: (m) => {
      qc.setQueryData(queryKeys.me, m);
      toast("success", "Saved.");
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.deleteAddress(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: queryKeys.addresses }),
  });

  return (
    <div className="container-page max-w-3xl py-10">
      <h1 className="mb-6 text-4xl font-extrabold">Your account</h1>
      <div className="flex flex-col gap-6">
        <Card className="p-5">
          <h2 className="mb-4 font-sans text-lg font-bold">Profile</h2>
          <form
            className="grid gap-4 sm:grid-cols-2"
            onSubmit={(e) => {
              e.preventDefault();
              save.mutate();
            }}
          >
            <Field label="Name" htmlFor="name">
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
            </Field>
            <Field label="Email (for receipts)" htmlFor="email">
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
              />
            </Field>
            <p className="text-sm text-ink-muted sm:col-span-2">
              Mobile: <span className="tabular">{me.data?.phone}</span>
            </p>
            <Button type="submit" loading={save.isPending} className="w-fit">
              Save
            </Button>
          </form>
        </Card>
        <Card className="p-5">
          <h2 className="mb-4 font-sans text-lg font-bold">Saved addresses</h2>
          {addresses.data?.length ? (
            <ul className="divide-y divide-line">
              {addresses.data.map((a) => (
                <li key={a.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                  <span>
                    <strong>{a.recipientName}</strong> · <span className="tabular">{a.phone}</span>
                    <br />
                    {a.line1}, {a.cityName} {a.pincode}
                  </span>
                  <button
                    type="button"
                    aria-label="Delete address"
                    className="rounded p-2 text-ink-muted hover:bg-danger-soft hover:text-danger"
                    onClick={() => remove.mutate(a.id)}
                  >
                    <Trash2 className="size-4" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-ink-muted">Addresses you use at checkout appear here.</p>
          )}
        </Card>
        <YourData />
        <div className="flex flex-wrap gap-3">
          <Link href="/orders" className="font-semibold text-jaggery underline">
            Your orders
          </Link>
          {me.data?.vendors.length ? (
            <Link href="/vendor" className="font-semibold text-jaggery underline">
              Kitchen portal
            </Link>
          ) : null}
          {me.data?.roles.includes("OPS") ? (
            <Link href="/ops" className="font-semibold text-jaggery underline">
              Operations
            </Link>
          ) : null}
        </div>
        <Button
          variant="secondary"
          className="w-fit"
          onClick={async () => {
            await logout();
            router.push("/");
          }}
        >
          <LogOut className="size-4" aria-hidden /> Sign out
        </Button>
      </div>
    </div>
  );
}

/** DPDP rights in one place: what we hold, a copy of it, and erasure. */
function YourData() {
  const me = useMe();
  const qc = useQueryClient();
  const router = useRouter();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const [typed, setTyped] = useState("");
  const download = useMutation({
    mutationFn: api.exportMyData,
    onSuccess: (data) => {
      const url = URL.createObjectURL(
        new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `food-del-my-data-${data.generatedAt.slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) => toast("error", (e as Error).message),
  });
  const acknowledge = useMutation({
    mutationFn: () => api.acknowledgePrivacyNotice(PRIVACY_NOTICE_VERSION),
    onSuccess: (m) => qc.setQueryData(queryKeys.me, m),
  });
  const erase = useMutation({
    mutationFn: api.deleteAccount,
    onSuccess: async () => {
      await logout().catch(() => {});
      qc.clear();
      toast("success", "Your account has been deleted.");
      router.push("/");
    },
  });
  const outdated = me.data && me.data.privacyNoticeAcknowledged !== PRIVACY_NOTICE_VERSION;

  return (
    <Card className="p-5">
      <h2 className="mb-1 font-sans text-lg font-bold">Your data</h2>
      <p className="mb-4 text-sm text-ink-soft">
        What we keep and why is set out in our{" "}
        <Link href="/privacy" className="font-semibold text-jaggery underline">
          privacy notice
        </Link>
        .
      </p>
      {outdated && (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md bg-info-soft p-3 text-sm text-info">
          <span className="flex items-center gap-2">
            <ShieldCheck className="size-4 shrink-0" aria-hidden />
            Our privacy notice has changed since you last read it.
          </span>
          <Button
            size="sm"
            variant="secondary"
            loading={acknowledge.isPending}
            onClick={() => acknowledge.mutate()}
          >
            I've read it
          </Button>
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" loading={download.isPending} onClick={() => download.mutate()}>
          <Download className="size-4" aria-hidden /> Download my data
        </Button>
        <Button
          variant="danger"
          onClick={() => {
            erase.reset();
            setTyped("");
            setConfirming(true);
          }}
        >
          <Trash2 className="size-4" aria-hidden /> Delete my account
        </Button>
      </div>
      <Dialog
        open={confirming}
        onClose={() => setConfirming(false)}
        title="Delete your account?"
        description="This can't be undone."
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            erase.mutate();
          }}
        >
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-soft">
            <li>Your name, mobile number, email and saved addresses are erased now.</li>
            <li>
              Past orders keep only amounts, items and the delivery pincode, for tax records. Names,
              phone numbers, addresses and gift messages are removed from them.
            </li>
            <li>You won't be able to raise a claim on a recent delivery.</li>
            <li>You can sign up again with the same number later, as a new customer.</li>
          </ul>
          {erase.error && (
            <p
              role="alert"
              className="rounded-md bg-danger-soft p-3 text-sm font-semibold text-danger"
            >
              {(erase.error as Error).message}
            </p>
          )}
          <Field label="Type DELETE to confirm" htmlFor="confirm-delete">
            <Input
              id="confirm-delete"
              autoComplete="off"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
            />
          </Field>
          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Keep my account
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={typed.trim() !== "DELETE"}
              loading={erase.isPending}
            >
              Delete account
            </Button>
          </div>
        </form>
      </Dialog>
    </Card>
  );
}

export default function AccountPage() {
  return (
    <RequireSession title="Sign in to your account">
      <Account />
    </RequireSession>
  );
}
