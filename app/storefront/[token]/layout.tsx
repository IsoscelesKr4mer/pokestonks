import 'server-only';

// White-label public-route layout. No app chrome, no nav, no auth UI.
// Inherits <html> + <body> from app/layout.tsx (which only includes
// QueryProvider + Toaster — both invisible until used). The page-level
// generateMetadata() in page.tsx overrides the <title> to drop the app name.
export default function StorefrontPublicLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-canvas text-text">{children}</div>;
}
