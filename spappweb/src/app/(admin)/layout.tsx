import { AdminMobileNav } from "@/components/layout/admin-mobile-nav";
import { AdminSidebar } from "@/components/layout/admin-sidebar";
import { UsoRecorder } from "@/components/layout/uso-recorder";
import { getAdminClientReferralScope } from "@/lib/auth/admin-client-scope";

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const clientScope = await getAdminClientReferralScope();
  const hideEquipo = Boolean(clientScope);

  return (
    <div className="flex h-dvh max-h-dvh flex-col overflow-hidden bg-background text-foreground lg:h-screen lg:max-h-screen lg:flex-row">
      <a
        href="#contenido"
        className="sr-only focus-visible:not-sr-only focus-visible:fixed focus-visible:top-3 focus-visible:left-3 focus-visible:z-[200] focus-visible:rounded-lg focus-visible:bg-background focus-visible:px-3 focus-visible:py-2 focus-visible:text-sm focus-visible:font-medium focus-visible:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        Saltar al contenido
      </a>
      <AdminSidebar
        className="hidden lg:flex"
        hideEquipo={hideEquipo}
        referralScope={clientScope}
      />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <AdminMobileNav hideEquipo={hideEquipo} referralScope={clientScope} />
        <main
          id="contenido"
          tabIndex={-1}
          className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain bg-white [-webkit-overflow-scrolling:touch] max-lg:pt-[calc(3.5rem+env(safe-area-inset-top,0px))]"
        >
          <div className="mx-auto max-w-[1313px] px-4 py-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-8">
            <UsoRecorder />
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
