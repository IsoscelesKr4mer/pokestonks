import { SearchBox } from '@/components/catalog/SearchBox';

export default function CatalogPage() {
  return (
    <div className="mx-auto w-full max-w-[1200px] px-6 md:px-8 py-10 space-y-6">
      <div className="grid gap-1 pb-[14px] border-b border-divider">
        <h1 className="text-[26px] font-semibold tracking-[-0.02em] leading-none">Catalog</h1>
        <div className="text-[11px] font-mono text-meta">
          LOCAL FIRST · SEARCH TO EXPLORE
        </div>
      </div>
      <SearchBox />
    </div>
  );
}
