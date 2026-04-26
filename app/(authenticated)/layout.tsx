import { TopNav } from '@/components/nav/TopNav';
import { BottomTabBar } from '@/components/nav/BottomTabBar';

export default function AuthenticatedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      <TopNav />
      <main className="flex-1 pb-20 md:pb-0">{children}</main>
      <BottomTabBar />
    </div>
  );
}
