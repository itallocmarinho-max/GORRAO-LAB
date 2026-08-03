import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { AuthProvider } from "@/hooks/useAuth";
import { Toaster } from "@/components/ui/sonner";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Página não encontrada</h2>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Início
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "DIRETORIA GORRÃO" },
      { name: "description", content: "Plataforma corporativa da Diretoria Gorrão para gestão financeira, prestação de contas, lançamentos, validação de verbas e indicadores executivos." },
      { name: "theme-color", content: "#0f1b3d" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "apple-mobile-web-app-title", content: "Diretoria" },
      { property: "og:site_name", content: "DIRETORIA GORRÃO" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "DIRETORIA GORRÃO" },
      { property: "og:description", content: "Plataforma corporativa da Diretoria Gorrão para gestão financeira, prestação de contas, lançamentos, validação de verbas e indicadores executivos." },
      { name: "twitter:title", content: "DIRETORIA GORRÃO" },
      { name: "twitter:description", content: "Plataforma corporativa da Diretoria Gorrão para gestão financeira, prestação de contas, lançamentos, validação de verbas e indicadores executivos." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/g56EPs5PO2Z181qAtDwAYjNviRQ2/social-images/social-1779246936430-IMG_9671.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/g56EPs5PO2Z181qAtDwAYjNviRQ2/social-images/social-1779246936430-IMG_9671.webp" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32x32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  return (
    <AuthProvider>
      <Outlet />
      <Toaster />
    </AuthProvider>
  );
}
