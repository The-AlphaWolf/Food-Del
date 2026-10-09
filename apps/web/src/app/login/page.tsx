"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { LoginForm } from "@/components/login-form";
import { Card } from "@/components/ui/primitives";

function Login() {
  const router = useRouter();
  const next = useSearchParams().get("next");
  return (
    <div className="container-page flex justify-center py-16">
      <Card className="w-full max-w-md p-6 md:p-8">
        <h1 className="mb-1 text-3xl font-extrabold">Sign in</h1>
        <p className="mb-6 text-ink-soft">Use your mobile number. No passwords.</p>
        <LoginForm
          onSignedIn={(me) => {
            const safeNext = next?.startsWith("/") && !next.startsWith("//") ? next : null;
            const isVendor = me.roles.some((r) => r === "VENDOR_OWNER" || r === "VENDOR_STAFF");
            const isOps = me.roles.some((r) => r === "OPS" || r === "ADMIN");
            router.push(safeNext ?? (isOps ? "/ops" : isVendor ? "/vendor" : "/orders"));
          }}
        />
      </Card>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <Login />
    </Suspense>
  );
}
