import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'My Google AI Studio App',
  description: 'Phantom Fleet App',
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
