import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'ReportOps',
    short_name: 'ReportOps',
    description:
      'Operational intelligence platform for CIS Benchmark collaboration, lab VM provisioning, automated audits, and report releases.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0a0e1a',
    theme_color: '#0a0e1a',
    categories: ['productivity', 'security', 'developer'],
    lang: 'vi-VN',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
