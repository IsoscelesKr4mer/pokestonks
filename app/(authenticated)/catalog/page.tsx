import { SearchBox } from '@/components/catalog/SearchBox';

export default function CatalogPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-6 py-8 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Search</h1>
        <p className="text-sm text-muted-foreground">
          Find Pokemon sealed product and singles, then add to your portfolio.
        </p>
      </div>
      <SearchBox />
    </div>
  );
}
