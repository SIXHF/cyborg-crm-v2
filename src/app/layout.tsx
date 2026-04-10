import type { Metadata } from "next";
import { ThemeProvider } from "@/components/theme-provider";
import { db } from "@/lib/db";
import { appSettings } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  let title = "Cyborg CRM";
  try {
    const [setting] = await db.select({ value: appSettings.value })
      .from(appSettings).where(eq(appSettings.key, "app_name")).limit(1);
    if (setting?.value) title = setting.value;
  } catch {}
  return { title, description: "High-performance CRM for lead management" };
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className="h-full antialiased"
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
