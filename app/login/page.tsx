import { LoginButton } from './login-button';

export default function LoginPage() {
  return (
    <main className="min-h-dvh flex items-center justify-center px-6">
      <div className="w-full max-w-md text-center space-y-8">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold tracking-tight">Pokestonks</h1>
          <p className="text-muted-foreground text-sm">
            Track your sealed Pokémon TCG product, see your real P&amp;L.
          </p>
        </div>
        <LoginButton />
      </div>
    </main>
  );
}
