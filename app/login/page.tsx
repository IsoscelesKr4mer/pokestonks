import { LoginButton } from './login-button';

export default function LoginPage() {
  return (
    <div className="min-h-dvh bg-canvas grid place-items-center px-6">
      <div className="grid gap-8 place-items-center max-w-[480px] w-full">
        <div className="text-[64px] font-bold tracking-[-0.025em] leading-none text-accent tabular-nums">
          POKESTONKS
        </div>
        <div className="vault-card p-8 w-full grid gap-4">
          <div className="text-[14px] text-text-muted text-center">
            Personal Pokémon TCG portfolio tracker.
          </div>
          <LoginButton />
        </div>
      </div>
    </div>
  );
}
