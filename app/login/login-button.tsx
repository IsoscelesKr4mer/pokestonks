'use client';
import { Button } from '@/components/ui/button';
import { createClient } from '@/lib/supabase/browser';

export function LoginButton() {
  const handleClick = async () => {
    const supabase = createClient();
    const origin = window.location.origin;
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${origin}/auth/callback`,
      },
    });
  };

  return (
    <Button onClick={handleClick} size="lg" className="w-full max-w-xs">
      Continue with Google
    </Button>
  );
}
