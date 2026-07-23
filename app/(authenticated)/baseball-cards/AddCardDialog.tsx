'use client';
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useCreateBaseballCard } from '@/lib/query/hooks/useBaseballCards';
import { STATUS_ORDER, STATUS_META } from '@/components/baseball/status';
import type { BaseballCardStatus } from '@/lib/validation/baseballCard';

const labelClass = 'text-[10px] uppercase tracking-[0.14em] text-meta font-mono';
const fieldClass = 'grid gap-1';

export function AddCardDialog() {
  const [open, setOpen] = useState(false);
  const create = useCreateBaseballCard();

  const [player, setPlayer] = useState('');
  const [setName, setSetName] = useState('');
  const [year, setYear] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [parallel, setParallel] = useState('');
  const [status, setStatus] = useState<BaseballCardStatus>('needs_photos');
  const [forSale, setForSale] = useState(true);
  const [askingPrice, setAskingPrice] = useState('');
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setPlayer('');
    setSetName('');
    setYear('');
    setCardNumber('');
    setParallel('');
    setStatus('needs_photos');
    setForSale(true);
    setAskingPrice('');
    setError(null);
  }

  async function submit() {
    setError(null);
    if (player.trim().length === 0) {
      setError('Player is required.');
      return;
    }
    const yearNum = year.trim() === '' ? null : Number(year);
    if (yearNum !== null && !Number.isInteger(yearNum)) {
      setError('Year must be a whole number.');
      return;
    }
    const askNum = askingPrice.trim() === '' ? null : Math.round(Number(askingPrice) * 100);
    if (askNum !== null && (!Number.isFinite(askNum) || askNum < 0)) {
      setError('Asking price must be a positive dollar amount.');
      return;
    }
    try {
      await create.mutateAsync({
        player: player.trim(),
        setName: setName.trim() || null,
        year: yearNum,
        cardNumber: cardNumber.trim() || null,
        parallel: parallel.trim() || null,
        sport: 'Baseball',
        status,
        forSale,
        askingPriceCents: askNum,
        photoUrls: [],
      });
      reset();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to add card.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger render={<Button variant="default" size="sm" />}>Add card</DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add baseball card</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <div className={fieldClass}>
            <label className={labelClass} htmlFor="bc-player">Player</label>
            <Input id="bc-player" value={player} onChange={(e) => setPlayer(e.target.value)} placeholder="Shohei Ohtani" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="bc-set">Set</label>
              <Input id="bc-set" value={setName} onChange={(e) => setSetName(e.target.value)} placeholder="2026 Topps Finest" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="bc-year">Year</label>
              <Input id="bc-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} placeholder="2026" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="bc-num">Card #</label>
              <Input id="bc-num" value={cardNumber} onChange={(e) => setCardNumber(e.target.value)} placeholder="168" />
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="bc-parallel">Parallel</label>
              <Input id="bc-parallel" value={parallel} onChange={(e) => setParallel(e.target.value)} placeholder="RayWave Refractor" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="bc-status">Status</label>
              <select
                id="bc-status"
                value={status}
                onChange={(e) => setStatus(e.target.value as BaseballCardStatus)}
                className="h-10 rounded-xl border border-divider bg-canvas px-3 text-[14px] text-text"
              >
                {STATUS_ORDER.map((s) => (
                  <option key={s} value={s}>{STATUS_META[s].label}</option>
                ))}
              </select>
            </div>
            <div className={fieldClass}>
              <label className={labelClass} htmlFor="bc-ask">Asking price ($)</label>
              <Input id="bc-ask" inputMode="decimal" value={askingPrice} onChange={(e) => setAskingPrice(e.target.value)} placeholder="99.99" />
            </div>
          </div>
          <label className="flex items-center gap-2 text-[13px] text-text">
            <input type="checkbox" checked={!forSale} onChange={(e) => setForSale(!e.target.checked)} />
            Keeper (not for sale)
          </label>
          {error && <p className="text-[12px] text-negative">{error}</p>}
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="outline" size="sm" onClick={() => { reset(); setOpen(false); }}>Cancel</Button>
          <Button variant="default" size="sm" onClick={submit} disabled={create.isPending}>
            {create.isPending ? 'Adding...' : 'Add card'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
