import type { BaseballCardStatus } from '@/lib/validation/baseballCard';

export type StatusMeta = {
  value: BaseballCardStatus;
  label: string;
  badgeClass: string;
};

// Distinct color per status, styled as pills like ManualPriceBadge.
export const STATUS_META: Record<BaseballCardStatus, StatusMeta> = {
  needs_photos: {
    value: 'needs_photos',
    label: 'Needs Photos',
    badgeClass: 'border-amber-500/40 bg-amber-500/10 text-amber-300',
  },
  photographed: {
    value: 'photographed',
    label: 'Photographed',
    badgeClass: 'border-sky-500/40 bg-sky-500/10 text-sky-300',
  },
  priced: {
    value: 'priced',
    label: 'Priced',
    badgeClass: 'border-violet-500/40 bg-violet-500/10 text-violet-300',
  },
  listed: {
    value: 'listed',
    label: 'Listed',
    badgeClass: 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300',
  },
  sold: {
    value: 'sold',
    label: 'Sold',
    badgeClass: 'border-zinc-500/40 bg-zinc-500/10 text-zinc-300',
  },
};

export const STATUS_ORDER: BaseballCardStatus[] = [
  'needs_photos',
  'photographed',
  'priced',
  'listed',
  'sold',
];

export const KEEP_BADGE_CLASS = 'border-teal-500/40 bg-teal-500/10 text-teal-300';
