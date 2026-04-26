type ImageFields = {
  imageStoragePath?: string | null;
  imageUrl?: string | null;
};

export function getImageUrl(item: ImageFields, supabaseUrl?: string): string {
  if (item.imageStoragePath) {
    const base = supabaseUrl ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
    return `${base}/storage/v1/object/public/${item.imageStoragePath.replace(/^\//, '')}`;
  }
  if (item.imageUrl) return item.imageUrl;
  return '/placeholder.svg';
}
