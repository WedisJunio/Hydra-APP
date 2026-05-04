import type { Metadata } from "next";
import "./globals.css";
import { ToastViewport } from "@/components/ui/toast-viewport";

export const metadata: Metadata = {
  title: "Gestão de projetos de engenharia",
  description:
    "Plataforma de gestão de produtividade, tempo e entrega para equipes de engenharia.",
  icons: {
    icon: "/company-logo.png",
    shortcut: "/company-logo.png",
    apple: "/company-logo.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap"
        />
      </head>
      <body>
        {children}
        <ToastViewport />
      </body>
    </html>
  );
}
