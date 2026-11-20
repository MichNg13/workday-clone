import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'Leave & Claims Portal', template: '%s · Leave & Claims Portal' },
  description: 'Workday-style self-service for leave applications and expense claims.',
  icons: { icon: '/icon.svg' },
};

export const viewport: Viewport = { themeColor: '#0875e1', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en-SG">
      <body>{children}</body>
    </html>
  );
}
