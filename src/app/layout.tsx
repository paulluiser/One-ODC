import type { Metadata } from "next";
import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/700.css";
import "./globals.css";
import "./design-system.css";
import "./opulence-theme.css";
import { ThemeProvider } from "@/components/theme-provider";
export const metadata: Metadata = {
  title: {
    default: "One ODC · Opulence Design Concept",
    template: "%s · One ODC",
  },
  description:
    "Every space. One vision. The project workspace for Opulence Design Concept.",
  robots: { index: false, follow: false },
  icons: {
    icon:
      process.env.ONE_ODC_UI_R0_ENABLED === "true"
        ? "/brand/opulence/one-odc-favicon.svg"
        : "/brand/one-odc-icon.svg",
  },
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="en"
      data-scroll-behavior="smooth"
      suppressHydrationWarning
      data-one-odc-brand={
        process.env.ONE_ODC_UI_R0_ENABLED === "true" ? "opulence" : undefined
      }
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
