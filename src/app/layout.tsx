import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { EventThemeProvider } from "@/components/event-theme-provider";

export const metadata: Metadata = {
  title: {
    default: "DTCE Daily Reporting System",
    template: "%s · DTCE Reports",
  },
  description:
    "Secure departmental reporting tools for DTCE Junior Church Global convention operations.",
  applicationName: "DTCE Reports",
  keywords: ["DTCE", "Junior Church", "RCCG", "Convention", "Daily Report"],
  authors: [{ name: "DTCE Junior Church Global" }],
  icons: {
    icon: [
      { url: "/dtce-logo.png", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/dtce-logo.png",
  },
  manifest: "/manifest.json",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#06090F" },
    { media: "(prefers-color-scheme: light)", color: "#F7F5F0" },
  ],
  openGraph: {
    title: "DTCE Daily Reporting System",
    description: "Secure departmental reporting for DTCE Junior Church Global.",
    siteName: "DTCE Reports",
    images: [{ url: "/dtce-logo.png", width: 512, height: 512 }],
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
