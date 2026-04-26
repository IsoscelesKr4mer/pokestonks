import { describe, it, expect } from 'vitest';
import { getImageUrl } from './images';

const ENV_URL = 'https://abc.supabase.co';

describe('getImageUrl', () => {
  it('returns Supabase public URL when image_storage_path is set', () => {
    expect(
      getImageUrl(
        { imageStoragePath: 'catalog/42.webp', imageUrl: 'https://upstream.example/x.png' },
        ENV_URL
      )
    ).toBe('https://abc.supabase.co/storage/v1/object/public/catalog/42.webp');
  });

  it('falls back to upstream image_url when storage path is null', () => {
    expect(
      getImageUrl({ imageStoragePath: null, imageUrl: 'https://upstream.example/x.png' }, ENV_URL)
    ).toBe('https://upstream.example/x.png');
  });

  it('falls back to placeholder when both are null', () => {
    expect(getImageUrl({ imageStoragePath: null, imageUrl: null }, ENV_URL)).toBe('/placeholder.svg');
  });

  it('treats undefined fields the same as null', () => {
    expect(getImageUrl({}, ENV_URL)).toBe('/placeholder.svg');
  });

  it('strips a leading slash from image_storage_path', () => {
    expect(
      getImageUrl({ imageStoragePath: '/catalog/42.webp' }, ENV_URL)
    ).toBe('https://abc.supabase.co/storage/v1/object/public/catalog/42.webp');
  });
});
