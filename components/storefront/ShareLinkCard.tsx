'use client';
import { useState } from 'react';
import { useShareTokens, useRevokeShareToken } from '@/lib/query/hooks/useStorefront';
import {
  ShareLinkCreateDialog,
  type ShareLinkEditTarget,
} from './ShareLinkCreateDialog';

function publicUrlFor(token: string): string {
  if (typeof window === 'undefined') return `/storefront/${token}`;
  return `${window.location.origin}/storefront/${token}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Ignore — the user can still select the text manually.
  }
}

export function ShareLinkCard() {
  const tokens = useShareTokens();
  const revoke = useRevokeShareToken();
  const [createOpen, setCreateOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<ShareLinkEditTarget | null>(null);
  const [showRevoked, setShowRevoked] = useState(false);
  const [confirmRevokeId, setConfirmRevokeId] = useState<number | null>(null);

  if (tokens.isLoading) {
    return (
      <section className="rounded-xl border border-divider bg-vault p-6">
        <p className="text-[12px] text-meta">Loading share links...</p>
      </section>
    );
  }
  if (tokens.error || !tokens.data) {
    return (
      <section className="rounded-xl border border-divider bg-vault p-6">
        <p className="text-[12px] text-rose-500">Failed to load share links.</p>
      </section>
    );
  }

  const active = tokens.data.tokens.filter((t) => t.revokedAt == null);
  const revoked = tokens.data.tokens.filter((t) => t.revokedAt != null);

  return (
    <section className="rounded-xl border border-divider bg-vault p-6">
      <header className="flex items-center justify-between mb-4">
        <h2 className="text-[16px] font-medium">Share links</h2>
        <button
          type="button"
          onClick={() => {
            setEditTarget(null);
            setCreateOpen(true);
          }}
          className="text-[12px] font-mono px-3 py-1.5 rounded-md border border-divider hover:bg-hover"
        >
          + Create another link
        </button>
      </header>

      {active.length === 0 ? (
        <div className="rounded-md border border-dashed border-divider p-4 text-center">
          <p className="text-[13px] text-meta">No share links yet.</p>
          <button
            type="button"
            onClick={() => setCreateOpen(true)}
            className="mt-3 text-[12px] font-mono px-3 py-1.5 rounded-md border border-divider hover:bg-hover"
          >
            Create your first share link
          </button>
        </div>
      ) : (
        <ul className="space-y-3">
          {active.map((tok) => (
            <li
              key={tok.id}
              className="rounded-md border border-divider bg-canvas p-3 flex items-start gap-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <span className="text-[13px] font-medium truncate">
                    {tok.label || '(no label)'}
                  </span>
                  <span className="text-[10px] text-meta font-mono uppercase tracking-[0.08em]">
                    {tok.headerTitle ?? 'Sealed Pokémon'}
                    {tok.contactLine ? ` · ${tok.contactLine}` : ''}
                  </span>
                </div>
                <div className="mt-2 text-[11px] font-mono text-meta truncate">
                  {publicUrlFor(tok.token)}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => copyToClipboard(publicUrlFor(tok.token))}
                  className="text-[11px] font-mono px-2 py-1 rounded-md border border-divider hover:bg-hover"
                >
                  Copy
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditTarget({
                      id: tok.id,
                      label: tok.label,
                      headerTitle: tok.headerTitle,
                      headerSubtitle: tok.headerSubtitle,
                      contactLine: tok.contactLine,
                    })
                  }
                  className="text-[11px] font-mono px-2 py-1 rounded-md border border-divider hover:bg-hover"
                >
                  Edit
                </button>
                {confirmRevokeId === tok.id ? (
                  <>
                    <button
                      type="button"
                      onClick={async () => {
                        await revoke.mutateAsync(tok.id);
                        setConfirmRevokeId(null);
                      }}
                      className="text-[11px] font-mono px-2 py-1 rounded-md border border-rose-500 text-rose-500 hover:bg-rose-500/10"
                    >
                      Confirm revoke
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeId(null)}
                      className="text-[11px] font-mono px-2 py-1 rounded-md border border-divider hover:bg-hover"
                    >
                      Cancel
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeId(tok.id)}
                    className="text-[11px] font-mono px-2 py-1 rounded-md border border-divider text-meta hover:text-rose-500"
                  >
                    Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {revoked.length > 0 && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowRevoked((s) => !s)}
            className="text-[11px] font-mono text-meta hover:text-text"
          >
            {showRevoked ? 'Hide' : 'Show'} {revoked.length} revoked link{revoked.length === 1 ? '' : 's'}
          </button>
          {showRevoked && (
            <ul className="mt-3 space-y-2">
              {revoked.map((tok) => (
                <li
                  key={tok.id}
                  className="rounded-md border border-divider bg-canvas/50 p-3 flex items-center gap-3 opacity-60"
                >
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px]">{tok.label || '(no label)'}</div>
                    <div className="text-[10px] font-mono text-meta truncate">
                      {publicUrlFor(tok.token)}
                    </div>
                  </div>
                  <span className="text-[10px] font-mono text-meta uppercase">Revoked</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <ShareLinkCreateDialog
        open={createOpen || editTarget != null}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditTarget(null);
          }
        }}
        editTarget={editTarget}
      />
    </section>
  );
}
