"use client";

import { queryKeys, useMe } from "@food-del/api-client/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { RequireSession } from "@/components/require-session";
import { useToast } from "@/components/toast";
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

export default function AccountPage() {
  return (
    <RequireSession title="Sign in to your account">
      <Account />
    </RequireSession>
  );
}
