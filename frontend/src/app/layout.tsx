import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import 'xterm/css/xterm.css';
import { ClientLayout } from '../components/ClientLayout';
import { benchmarkLabel, projectConfig } from '../lib/project-config';

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

const siteUrl = projectConfig.frontendUrl;
const siteDescription = `ReportOps is an operational intelligence platform for collaborative ${benchmarkLabel} reporting, lab VM provisioning, automated audits, evidence archiving, and GitHub-backed report releases.`;

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'ReportOps',
    template: '%s | ReportOps',
  },
  description: siteDescription,
  applicationName: 'ReportOps',
  keywords: [
    'ReportOps',
    'CIS Benchmark',
    'AlmaLinux',
    'ONLYOFFICE',
    'security report',
    'lab vm',
    'OpenSCAP',
    'audit evidence',
    'GitHub release',
  ],
  authors: [{ name: 'ReportOps Team' }],
  creator: 'ReportOps Team',
  publisher: 'ReportOps Team',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: '/icon.svg',
    shortcut: '/icon.svg',
  },
  openGraph: {
    title: 'ReportOps',
    description: siteDescription,
    url: siteUrl,
    siteName: 'ReportOps',
    locale: 'vi_VN',
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'ReportOps',
    description: siteDescription,
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0e1a',
  colorScheme: 'dark',
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
