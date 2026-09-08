import type { Metadata } from "next";
import { ClerkProvider } from "@clerk/nextjs";
import { DM_Sans, Tajawal } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-dm-sans",
});

const tajawal = Tajawal({
  subsets: ["arabic"],
  display: "swap",
  variable: "--font-tajawal",
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://masarifi-admin-prototype.sites.openai.com"),
  icons: { icon: "/download.png" },
  title: "مصاريفي | لوحة الإدارة",
  description: "واجهة تشغيلية آمنة لمنصة مصاريفي",
  openGraph: {
    title: "مصاريفي | لوحة الإدارة",
    description: "واجهة تشغيلية عربية لمنصة مصاريفي",
    images: [{ url: "/og.png", width: 1673, height: 941, alt: "مصاريفي - لوحة الإدارة" }],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const clerkKey = process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY;
  const content = <Providers identityEnabled={Boolean(clerkKey)}>{children}</Providers>;
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <body className={`${dmSans.variable} ${tajawal.variable}`} suppressHydrationWarning>
        {clerkKey
          ? <ClerkProvider publishableKey={clerkKey}>{content}</ClerkProvider>
          : content}
      </body>
    </html>
  );
}
