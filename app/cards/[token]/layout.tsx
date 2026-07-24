import 'server-only';

// White-label public-route layout for a shared baseball collection. No app
// chrome, no nav, no auth UI. Mirrors the storefront public layout. The
// page-level generateMetadata() overrides the <title> to drop the app name.
export default function PublicCollectionLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-canvas text-text">{children}</div>;
}
