/**
 * TanStack Query bindings. Works in React DOM and React Native alike — no DOM APIs here.
 */
import type { AvailabilityQuery, ItemListQuery, QuoteRequest } from "@food-del/domain/contracts";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, type ReactNode, useContext } from "react";
import type { ApiClient } from "./client";

const ApiContext = createContext<ApiClient | null>(null);

export function ApiProvider({ client, children }: { client: ApiClient; children: ReactNode }) {
  return <ApiContext.Provider value={client}>{children}</ApiContext.Provider>;
}

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("useApi must be used inside <ApiProvider>");
  return client;
}

export const queryKeys = {
  cities: ["cities"] as const,
  categories: ["categories"] as const,
  pincode: (pincode: string) => ["pincode", pincode] as const,
  items: (q: ItemListQuery) => ["items", q] as const,
  item: (slug: string, pincode?: string) => ["item", slug, pincode ?? null] as const,
  availability: (q: AvailabilityQuery) => ["availability", q] as const,
  quote: (req: QuoteRequest) => ["quote", req] as const,
  me: ["me"] as const,
  addresses: ["addresses"] as const,
  orders: ["orders"] as const,
  order: (id: string) => ["order", id] as const,
  kitchens: ["kitchens"] as const,
  vendorOverview: (id: string) => ["vendor-overview", id] as const,
  vendorDay: (id: string, date: string) => ["vendor-day", id, date] as const,
  inventory: (id: string, from?: string) => ["inventory", id, from ?? null] as const,
  opsOverview: ["ops-overview"] as const,
};

export function useCities() {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.cities, queryFn: api.cities, staleTime: 5 * 60_000 });
}

export function useItems(q: ItemListQuery) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.items(q),
    queryFn: () => api.items(q),
    placeholderData: keepPreviousData,
  });
}

export function usePincode(pincode: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.pincode(pincode ?? ""),
    queryFn: () => api.pincode(pincode!),
    enabled: Boolean(pincode && /^[1-9]\d{5}$/.test(pincode)),
    staleTime: 60 * 60_000,
  });
}

export function useAvailability(q: AvailabilityQuery | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.availability(q ?? { pincode: "", variantId: "" }),
    queryFn: () => api.availability(q!),
    enabled: Boolean(q?.pincode && q.variantId),
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

export function useQuote(req: QuoteRequest | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.quote(req ?? { pincode: "", lines: [] }),
    queryFn: () => api.quote(req!),
    enabled: Boolean(req && req.lines.length > 0 && /^[1-9]\d{5}$/.test(req.pincode)),
    placeholderData: keepPreviousData,
    staleTime: 15_000,
  });
}

export function useMe(enabled = true) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.me,
    queryFn: api.me,
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useOrders(enabled = true) {
  const api = useApi();
  return useQuery({ queryKey: queryKeys.orders, queryFn: api.orders, enabled });
}

/** Polls while the parcel is moving so the tracking page stays live. */
export function useOrder(id: string | null) {
  const api = useApi();
  return useQuery({
    queryKey: queryKeys.order(id ?? ""),
    queryFn: () => api.order(id!),
    enabled: Boolean(id),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === "COMPLETED" || status === "CANCELLED" || status === "EXPIRED"
        ? false
        : 20_000;
    },
  });
}

export function useCancelOrder() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.cancelOrder(id),
    onSuccess: (order) => {
      qc.setQueryData(queryKeys.order(order.id), order);
      void qc.invalidateQueries({ queryKey: queryKeys.orders });
    },
  });
}
