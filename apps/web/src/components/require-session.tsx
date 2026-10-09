"use client";

import type { ReactNode } from "react";
import { useSession } from "@/lib/session";
import { LoginForm } from "./login-form";
import { Card } from "./ui/primitives";

/** Renders children for signed-in users; otherwise an inline sign-in card. */
export function RequireSession({
  children,
  title = "Sign in to continue",
}: {
  children: ReactNode;
  title?: string;
}) {
  const { token } = useSession();
  if (!token) {
    return (
      <div className="container-page flex justify-center py-16">
        <Card className="w-full max-w-md p-6">
          <h1 className="mb-4 text-2xl font-extrabold">{title}</h1>
          <LoginForm onSignedIn={() => {}} />
        </Card>
      </div>
    );
  }
  return <>{children}</>;
}
