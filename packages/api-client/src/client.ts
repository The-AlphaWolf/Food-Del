import type {
  AddKitchenMemberRequest,
  Address,
  AddressInput,
  Availability,
  AvailabilityQuery,
  Blackout,
  BlackoutInput,
  Category,
  City,
  Claim,
  CreateCityRequest,
  CreateClaimRequest,
  CreateKitchenRequest,
  DirectoryDistrict,
  InventoryGrid,
  InventoryUpdateRequest,
  ItemAdminDetail,
  ItemCard,
  ItemDetail,
  ItemInput,
  ItemListQuery,
  JobName,
  JobResult,
  KitchenDetail,
  Me,
  OnboardingOptions,
  OpsCity,
  OpsOverview,
  OpsShipmentRow,
  OpsTransitionRequest,
  OpsVendor,
  OrderDetail,
  OrderSummary,
  PincodeLookup,
  PlaceOrderRequest,
  PlaceOrderResponse,
  Quote,
  QuoteRequest,
  ReachPreview,
  ReachPreviewRequest,
  ResolveClaimRequest,
  Route,
  RouteInput,
  Session,
  SetItemStatusRequest,
  UpdateCityRequest,
  UpdateKitchenRequest,
  UpdateVendorRequest,
  VendorDay,
  VendorDetail,
  VendorOverview,
  VendorShipment,
} from "@food-del/domain/contracts";
import { ApiError } from "./errors";

export interface ApiClientOptions {
  /** e.g. "https://food-del.in/api" or "/api" in the browser. */
  baseUrl: string;
  /** Session token for `Authorization: Bearer` (mobile). The web app may rely on the cookie instead. */
  getToken?: () => string | null | Promise<string | null>;
  fetch?: typeof fetch;
  /** Sent as `X-Client-Version` so old mobile builds can be told to update. */
  clientVersion?: string;
  onUnauthorized?: () => void;
}

type Query = Record<string, string | number | boolean | undefined | null>;

function qs(q: Query | undefined): string {
  if (!q) return "";
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q))
    if (v !== undefined && v !== null && v !== "") p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : "";
}

export function newIdempotencyKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

/**
 * Thin, typed wrapper over API v1. Shapes come from `@food-del/domain/contracts`, the same
 * schemas the server validates against, so web, mobile and server can't drift.
 */
export function createApiClient(options: ApiClientOptions) {
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);

  async function request<T>(
    method: string,
    path: string,
    init: { query?: Query; body?: unknown; headers?: Record<string, string> } = {},
  ): Promise<T> {
    const token = options.getToken ? await options.getToken() : null;
    let res: Response;
    try {
      res = await doFetch(`${options.baseUrl}${path}${qs(init.query)}`, {
        method,
        credentials: "include",
        headers: {
          Accept: "application/json",
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
          ...(options.clientVersion ? { "X-Client-Version": options.clientVersion } : {}),
          ...init.headers,
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
    } catch {
      throw ApiError.fromProblem(0, null);
    }
    if (res.status === 204) return undefined as T;
    const text = await res.text();
    const data = text ? (JSON.parse(text) as unknown) : null;
    if (!res.ok) {
      if (res.status === 401) options.onUnauthorized?.();
      throw ApiError.fromProblem(res.status, data as Record<string, never>);
    }
    return data as T;
  }

  const get = <T>(path: string, query?: Query) => request<T>("GET", path, { query });
  const post = <T>(path: string, body?: unknown, headers?: Record<string, string>) =>
    request<T>("POST", path, { body: body ?? {}, headers });

  return {
    request,

    // Catalogue & serviceability
    cities: () => get<City[]>("/v1/cities"),
    categories: () => get<Category[]>("/v1/categories"),
    pincode: (pincode: string) => get<PincodeLookup>(`/v1/pincodes/${encodeURIComponent(pincode)}`),
    items: (q: ItemListQuery = {}) => get<ItemCard[]>("/v1/items", q as Query),
    item: (slug: string, pincode?: string) =>
      get<ItemDetail>(`/v1/items/${encodeURIComponent(slug)}`, { pincode }),
    vendor: (slug: string, pincode?: string) =>
      get<VendorDetail>(`/v1/vendors/${encodeURIComponent(slug)}`, { pincode }),
    availability: (q: AvailabilityQuery) =>
      get<Availability>("/v1/availability", q as unknown as Query),
    quote: (req: QuoteRequest) => post<Quote>("/v1/quotes", req),

    // Account
    requestOtp: (phone: string) =>
      post<{ sent: true; devCode?: string }>("/v1/auth/otp", { phone }),
    verifyOtp: (phone: string, code: string) => post<Session>("/v1/auth/verify", { phone, code }),
    logout: () => post<void>("/v1/auth/logout"),
    me: () => get<Me>("/v1/me"),
    updateMe: (patch: { fullName?: string; email?: string }) =>
      request<Me>("PATCH", "/v1/me", { body: patch }),
    addresses: () => get<Address[]>("/v1/me/addresses"),
    addAddress: (input: AddressInput) => post<Address>("/v1/me/addresses", input),
    deleteAddress: (id: string) => request<void>("DELETE", `/v1/me/addresses/${id}`),

    // Orders
    placeOrder: (req: PlaceOrderRequest, idempotencyKey: string) =>
      post<PlaceOrderResponse>("/v1/orders", req, { "Idempotency-Key": idempotencyKey }),
    orders: () => get<OrderSummary[]>("/v1/orders"),
    order: (id: string) => get<OrderDetail>(`/v1/orders/${id}`),
    retryPayment: (id: string) => post<PlaceOrderResponse>(`/v1/orders/${id}/payment`),
    verifyPayment: (id: string, body: { providerPaymentId: string; signature: string }) =>
      post<OrderDetail>(`/v1/orders/${id}/payment/verify`, body),
    cancelOrder: (id: string) => post<OrderDetail>(`/v1/orders/${id}/cancel`),
    createClaim: (shipmentId: string, body: CreateClaimRequest) =>
      post<Claim>(`/v1/shipments/${shipmentId}/claims`, body),

    // Vendor portal
    kitchens: () => get<{ id: string; slug: string; name: string }[]>("/v1/vendor/kitchens"),
    vendorOverview: (vendorId: string) => get<VendorOverview>(`/v1/vendor/${vendorId}/overview`),
    vendorDay: (vendorId: string, date: string) =>
      get<VendorDay>(`/v1/vendor/${vendorId}/days/${date}`),
    packShipment: (shipmentId: string, body: { preparedAt?: string } = {}) =>
      post<VendorShipment>(`/v1/vendor/shipments/${shipmentId}/pack`, body),
    reportShortfall: (shipmentId: string, note: string) =>
      post<VendorShipment>(`/v1/vendor/shipments/${shipmentId}/shortfall`, { note }),
    inventory: (vendorId: string, q: { from?: string; days?: number } = {}) =>
      get<InventoryGrid>(`/v1/vendor/${vendorId}/inventory`, q),
    updateInventory: (vendorId: string, body: InventoryUpdateRequest) =>
      request<InventoryGrid>("PUT", `/v1/vendor/${vendorId}/inventory`, { body }),

    // Operations
    opsOverview: () => get<OpsOverview>("/v1/ops/overview"),
    opsShipments: (
      q: { status?: string; dispatchDate?: string; q?: string; exceptions?: boolean } = {},
    ) => get<OpsShipmentRow[]>("/v1/ops/shipments", q),
    opsTransition: (shipmentId: string, body: OpsTransitionRequest) =>
      post<OpsShipmentRow>(`/v1/ops/shipments/${shipmentId}/transition`, body),
    opsClaims: (status?: "OPEN" | "APPROVED" | "REJECTED") =>
      get<Claim[]>("/v1/ops/claims", { status }),
    resolveClaim: (id: string, body: ResolveClaimRequest) =>
      post<Claim>(`/v1/ops/claims/${id}/resolve`, body),
    blackouts: () => get<Blackout[]>("/v1/ops/blackouts"),
    addBlackout: (input: BlackoutInput) => post<Blackout[]>("/v1/ops/blackouts", input),
    removeBlackout: (id: string) => request<Blackout[]>("DELETE", `/v1/ops/blackouts/${id}`),
    opsCities: () => get<OpsCity[]>("/v1/ops/cities"),
    updateCity: (id: string, patch: UpdateCityRequest) =>
      request<OpsCity[]>("PATCH", `/v1/ops/cities/${id}`, { body: patch }),
    opsVendors: () => get<OpsVendor[]>("/v1/ops/vendors"),
    updateVendor: (id: string, patch: UpdateVendorRequest) =>
      request<OpsVendor[]>("PATCH", `/v1/ops/vendors/${id}`, { body: patch }),
    runJob: (job: JobName) => post<JobResult>(`/v1/jobs/${job}`),

    // Onboarding (ops)
    onboardingOptions: () => get<OnboardingOptions>("/v1/ops/onboarding/options"),
    createKitchen: (body: CreateKitchenRequest) => post<KitchenDetail>("/v1/ops/kitchens", body),
    kitchen: (id: string) => get<KitchenDetail>(`/v1/ops/kitchens/${id}`),
    updateKitchen: (id: string, patch: UpdateKitchenRequest) =>
      request<KitchenDetail>("PATCH", `/v1/ops/kitchens/${id}`, { body: patch }),
    addKitchenMember: (id: string, body: AddKitchenMemberRequest) =>
      post<KitchenDetail>(`/v1/ops/kitchens/${id}/members`, body),
    createItem: (kitchenId: string, body: ItemInput) =>
      post<ItemAdminDetail>(`/v1/ops/kitchens/${kitchenId}/items`, body),
    reachPreview: (kitchenId: string, body: ReachPreviewRequest) =>
      post<ReachPreview>(`/v1/ops/kitchens/${kitchenId}/reach-preview`, body),
    adminItem: (id: string) => get<ItemAdminDetail>(`/v1/ops/items/${id}`),
    updateItem: (id: string, body: ItemInput) =>
      request<ItemAdminDetail>("PUT", `/v1/ops/items/${id}`, { body }),
    setItemStatus: (id: string, body: SetItemStatusRequest) =>
      post<ItemAdminDetail>(`/v1/ops/items/${id}/status`, body),
    routes: (filter: { originCityId?: string; destinationCityId?: string } = {}) =>
      get<Route[]>("/v1/ops/routes", filter),
    saveRoute: (body: RouteInput) => request<Route>("PUT", "/v1/ops/routes", { body }),
    directoryDistricts: (stateCode?: string) =>
      get<DirectoryDistrict[]>("/v1/ops/directory/districts", { stateCode }),
    createCity: (body: CreateCityRequest) => post<OpsCity[]>("/v1/ops/cities", body),

    // Development tools (only mounted when enabled on the server)
    devPay: (orderId: string) => post<OrderDetail>(`/v1/dev/orders/${orderId}/pay`),
    devAdvance: (shipmentId: string, status: string) =>
      post<{ outcomes: string[] }>(`/v1/dev/shipments/${shipmentId}/advance`, { status }),
    devTick: () => post<JobResult[]>("/v1/dev/tick"),
  };
}

export type ApiClient = ReturnType<typeof createApiClient>;
