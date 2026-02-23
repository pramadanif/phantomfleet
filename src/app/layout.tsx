import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Phantom Fleet',
  description: 'Phantom Fleet',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
