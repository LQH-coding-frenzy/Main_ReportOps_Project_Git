import './globals.css';
import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'CIS Benchmark Report Platform - Built based on ReportOps structure',
  description:
    'Collaborative platform for writing and managing CIS Benchmark security reports. Built for remote teams with role-based section editing, ONLYOFFICE integration, and automated report generation.',
  keywords: ['CIS Benchmark', 'AlmaLinux', 'security report', 'ONLYOFFICE', 'collaboration'],
  authors: [{ name: 'ReportOps Team' }],
  openGraph: {
    title: 'ReportOps — CIS Benchmark Report Platform',
    description: 'Collaborative CIS Benchmark security report editing platform',
    type: 'website',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
