import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { EventThemeProvider } from "@/components/event-theme-provider";
import { PwaInstallPrompt } from "@/components/pwa-install-prompt";
import { FloatingNotificationPrompt } from "@/components/floating-notification-prompt";
import { OfflineSyncIndicator } from "@/components/offline-sync-indicator";
import { InAppNotificationToast } from "@/components/in-app-notification-toast";

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FAF9F6" },
    { media: "(prefers-color-scheme: dark)", color: "#06090F" },
  ],
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
    // Use the official DTCE logo as the primary favicon across all browsers
    icon: [
      { url: "/dtce-logo-white-bg.png", type: "image/png", sizes: "any" },
      { url: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [
      // iOS home screen icon — white background version renders correctly at 180px
      { url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" },
    ],
    // Browser tab shortcut icon — white-bg version is most legible at small sizes
    shortcut: "/dtce-logo-white-bg.png",
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
          defaultTheme="system"
          enableSystem={true}
          disableTransitionOnChange={false}
        >
          <EventThemeProvider>
            {children}
            <PwaInstallPrompt />
            <FloatingNotificationPrompt />
            <OfflineSyncIndicator />
            {/* Mobile-only floating heads-up notification banner (like WhatsApp/Telegram foreground banner) */}
            <InAppNotificationToast />
          </EventThemeProvider>
        </ThemeProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  let refreshing = false;
                  navigator.serviceWorker.addEventListener('controllerchange', () => {
                    if (refreshing) return;
                    refreshing = true;
                    window.location.reload();
                  });

                  navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(reg => {
                    reg.update().catch(() => {});
                    document.addEventListener('visibilitychange', () => {
                      if (document.visibilityState === 'visible') {
                        reg.update().catch(() => {});
                      }
                    });
                    setInterval(() => {
                      reg.update().catch(() => {});
                    }, 5 * 60 * 1000);
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
