"use client";

import { useParams } from "next/navigation";
import { createContext, useContext } from "react";

/**
 * Route params, overridable. On GitHub Pages, IDs created in the visitor's browser (orders,
 * kitchens) have no pre-built page, so the 404 page renders the right screen and supplies the
 * params from the URL through this context.
 */
const Override = createContext<Record<string, string> | null>(null);
export const RouteParamsProvider = Override.Provider;

export function useRouteParams<T extends Record<string, string>>(): T {
  const override = useContext(Override);
  const params = useParams<T>();
  return (override ?? params) as T;
}
