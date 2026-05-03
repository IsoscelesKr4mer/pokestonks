import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

// Transparent 32x32 favicon. Suppresses the default app/favicon.ico
// inheritance so the public route bears no Pokestonks brand mark.
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
      />
    ),
    { ...size }
  );
}
