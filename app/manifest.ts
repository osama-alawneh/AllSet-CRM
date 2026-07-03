import type { MetadataRoute } from 'next';

// Served at /manifest.webmanifest. iOS ignores SVG icons (apple-touch-icon PNG is a post-MVP
// follow-up — see the plan's Global Constraints); Chromium/Android honor the SVG at any size.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ClearView CRM',
    short_name: 'ClearView',
    display: 'standalone',
    start_url: '/',
    background_color: '#e9eef3',
    theme_color: '#2f6df6',
    icons: [
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
    ],
  };
}
