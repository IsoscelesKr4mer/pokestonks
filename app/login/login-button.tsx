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
    <Button
      onClick={handleClick}
      size="lg"
      className="w-full px-4 py-3 rounded-xl bg-accent text-canvas font-semibold text-[14px] hover:bg-[#c5a0ff] transition-colors flex items-center justify-center gap-2"
    >
      Continue with Google
    </Button>
  );
}
