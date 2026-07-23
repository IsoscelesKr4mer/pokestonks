'use client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateBaseballCardInput,
  UpdateBaseballCardInput,
} from '@/lib/validation/baseballCard';

// Row shape as returned by Supabase (snake_case columns).
export type BaseballCardRow = {
  id: number;
  user_id: string;
  player: string;
  set_name: string | null;
  year: number | null;
  card_number: string | null;
  parallel: string | null;
  sport: string;
  status: 'needs_photos' | 'photographed' | 'priced' | 'listed' | 'sold';
  for_sale: boolean;
  asking_price_cents: number | null;
  comp_note: string | null;
  photo_urls: string[];
  image_storage_path: string | null;
  ebay_item_id: string | null;
  ebay_offer_id: string | null;
  ebay_sku: string | null;
  sold_price_cents: number | null;
  sold_date: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const json = <T,>(res: Response) =>
  res.json().then((b) => {
    if (!res.ok) throw new Error((b as { error?: string }).error ?? `HTTP ${res.status}`);
    return b as T;
  });

export function useBaseballCards() {
  return useQuery({
    queryKey: ['baseball-cards'],
    queryFn: async () => {
      const res = await fetch('/api/baseball-cards');
      return json<{ cards: BaseballCardRow[] }>(res);
    },
  });
}

export function useCreateBaseballCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBaseballCardInput) => {
      const res = await fetch('/api/baseball-cards', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      return json<{ card: BaseballCardRow }>(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baseball-cards'] });
    },
  });
}

export function useUpdateBaseballCard(id: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateBaseballCardInput) => {
      const res = await fetch(`/api/baseball-cards/${id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(input),
      });
      return json<{ card: BaseballCardRow }>(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baseball-cards'] });
    },
  });
}

export function useDeleteBaseballCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/baseball-cards/${id}`, { method: 'DELETE' });
      return json<{ card: BaseballCardRow }>(res);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['baseball-cards'] });
    },
  });
}
