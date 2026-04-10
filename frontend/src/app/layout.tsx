import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Metadata } from 'next';

const inter = Inter({
  subsets: ['latin', 'vietnamese'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-mono',
});

import { ClientLayout } from '../components/ClientLayout';

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
    <html lang="vi" className={`${inter.variable} ${jetbrainsMono.variable}`}>
      <body>
        <ClientLayout>
          {children}
        </ClientLayout>
      </body>
    </html>
  );
}
