import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { EventThemeProvider } from "@/components/event-theme-provider";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { FloatingNotificationPrompt } from "@/components/floating-notification-prompt";
import { OfflineSyncIndicator } from "@/components/offline-sync-indicator";

export const viewport: Viewport = {
  themeColor: "#0F2A4A",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export const metadata: Metadata = {
  title: {
    default: "DTCE Daily Reporting System",
    template: "%s · DTCE Reports",
  },
  description:
    "Secure departmental reporting tools for DTCE Junior Church Global convention operations.",
  applicationName: "DTCE Reporting",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "DTCE Reports",
  },
  keywords: ["DTCE", "Junior Church", "RCCG", "Convention", "Daily Report"],
  authors: [{ name: "DTCE Junior Church Global" }],
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/dtce-logo.png", type: "image/png" },
    ],
    apple: [
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    shortcut: "/icon-192.png",
  },
  manifest: "/manifest.json",
  openGraph: {
    title: "DTCE Daily Reporting System",
    description: "Secure departmental reporting for DTCE Junior Church Global.",
    siteName: "DTCE Reports",
    images: [{ url: "/icon-512.png", width: 512, height: 512 }],
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className="h-full">
      <body className="min-h-full flex flex-col antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
          disableTransitionOnChange={false}
        >
          <EventThemeProvider>
            {children}
            <PwaInstallPrompt />
            <FloatingNotificationPrompt />
            <OfflineSyncIndicator />
          </EventThemeProvider>
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').then(reg => {
                    console.log('SW registered successfully:', reg.scope);
                  }).catch(err => {
                    console.error('SW registration failed:', err);
                  });
                });
              }
            `
          }}
        />
      </body>
    </html>
  );
}
