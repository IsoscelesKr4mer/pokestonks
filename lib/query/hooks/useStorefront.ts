'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ShareTokenDto } from '@/app/api/storefront/tokens/route';
import type { StorefrontListingDto } from '@/app/api/storefront/listings/route';

const TOKENS_KEY = ['storefront', 'tokens'] as const;
const LISTINGS_KEY = ['storefront', 'listings'] as const;
const HOLDINGS_KEY_PREFIX = ['holdings'] as const;
const HOLDING_KEY_PREFIX = ['holding'] as const;

async function jsonFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      // ignore
    }
    const e = new Error(`fetch failed: ${res.status}`);
    (e as Error & { status?: number; body?: unknown }).status = res.status;
    (e as Error & { status?: number; body?: unknown }).body = body;
    throw e;
  }
  return (await res.json()) as T;
}

// ---------------- Tokens ----------------

export function useShareTokens() {
  return useQuery({
    queryKey: TOKENS_KEY,
    queryFn: () => jsonFetch<{ tokens: ShareTokenDto[] }>('/api/storefront/tokens'),
  });
}

export type CreateShareTokenInput = {
  label?: string;
  headerTitle?: string | null;
  headerSubtitle?: string | null;
  contactLine?: string | null;
};

export function useCreateShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateShareTokenInput) =>
      jsonFetch<{ token: ShareTokenDto }>('/api/storefront/tokens', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });
}

export type UpdateShareTokenInput = CreateShareTokenInput;

export function useUpdateShareToken(tokenId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateShareTokenInput) =>
      jsonFetch<{ token: ShareTokenDto }>(`/api/storefront/tokens/${tokenId}`, {
        method: 'PATCH',
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });
}

export function useRevokeShareToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (tokenId: number) =>
      jsonFetch<{ token: ShareTokenDto }>(`/api/storefront/tokens/${tokenId}`, {
        method: 'DELETE',
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TOKENS_KEY });
    },
  });
}

// ---------------- Listings ----------------

export function useStorefrontListings() {
  return useQuery({
    queryKey: LISTINGS_KEY,
    queryFn: () =>
      jsonFetch<{ listings: StorefrontListingDto[] }>('/api/storefront/listings'),
  });
}

export type UpsertListingInput = {
  catalogItemId: number;
  /** Set to a number to pin a manual price; null to clear override; omit to leave price unchanged. */
  askingPriceCents?: number | null;
  /** Set true to hide; false to unhide; omit to leave unchanged. */
  hidden?: boolean;
};

export function useUpsertStorefrontListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertListingInput) =>
      jsonFetch<{
        listing: {
          catalogItemId: number;
          askingPriceCents: number | null;
          hidden: boolean;
          createdAt: string;
          updatedAt: string;
        };
      }>('/api/storefront/listings', {
        method: 'POST',
        body: JSON.stringify(input),
      }),
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: LISTINGS_KEY });
      qc.invalidateQueries({ queryKey: HOLDINGS_KEY_PREFIX });
      qc.invalidateQueries({ queryKey: [...HOLDING_KEY_PREFIX, variables.catalogItemId] });
    },
  });
}

export function useRemoveStorefrontListing() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (catalogItemId: number) =>
      jsonFetch<{
        listing: {
          catalogItemId: number;
          askingPriceCents: number | null;
          hidden: boolean;
          createdAt: string;
          updatedAt: string;
        };
      }>(`/api/storefront/listings/${catalogItemId}`, { method: 'DELETE' }),
    onSuccess: (_data, catalogItemId) => {
      qc.invalidateQueries({ queryKey: LISTINGS_KEY });
      qc.invalidateQueries({ queryKey: HOLDINGS_KEY_PREFIX });
      qc.invalidateQueries({ queryKey: [...HOLDING_KEY_PREFIX, catalogItemId] });
    },
  });
}
