"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, Menu, X } from "lucide-react";
import { logoutAdminAction } from "@/lib/actions/auth-actions";
import {
  isChildActive,
  isGroupActive,
  navGroupsForAdminScope,
} from "@/components/layout/admin-nav-links";
import { ScopedReferralLink } from "@/components/layout/scoped-referral-link";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const headerBtnClass =
  "inline-flex size-11 shrink-0 cursor-pointer touch-manipulation items-center justify-center rounded-lg text-foreground transition-[color,transform] hover:bg-muted active:scale-[0.96] active:bg-muted";

export function AdminMobileNav({
  hideEquipo = false,
  referralScope = null,
}: {
  hideEquipo?: boolean;
  referralScope?: string | null;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const navGroups = navGroupsForAdminScope(hideEquipo);

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <header className="fixed inset-x-0 top-0 z-50 shrink-0 border-b border-border bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 lg:hidden safe-area-top">
        <div className="relative flex h-14 items-center justify-between px-4">
          <SheetTrigger className={headerBtnClass} aria-label="Abrir menú">
            <Menu className="pointer-events-none size-5" />
          </SheetTrigger>

          <p className="pointer-events-none text-sm font-semibold">
            Administración
          </p>

          <form action={logoutAdminAction}>
            <button
              type="submit"
              className={cn(headerBtnClass, "text-muted-foreground")}
              aria-label="Cerrar sesión"
            >
              <LogOut className="pointer-events-none size-5" />
            </button>
          </form>
        </div>
      </header>

      <SheetContent
        side="left"
        showCloseButton={false}
        className="w-72 max-w-[85vw] gap-0 bg-sidebar p-0 text-sidebar-foreground data-[side=left]:w-72 data-[side=left]:max-w-[85vw]"
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-sidebar-border px-5 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <SheetTitle className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
              Administración
            </SheetTitle>
            <SheetDescription className="text-sm text-sidebar-foreground">
              Panel interno
            </SheetDescription>
          </div>
          <SheetClose
            className={headerBtnClass}
            aria-label="Cerrar menú"
          >
            <X className="pointer-events-none size-5" />
          </SheetClose>
        </div>
        <ScrollArea className="min-h-0 flex-1">
          <nav className="flex flex-col gap-4 p-3" aria-label="Secciones">
            {navGroups.map((group) => {
              const Icon = group.icon;
              const groupActive = isGroupActive(pathname, group);
              const hasChildren = group.children.length > 0;

              if (!hasChildren) {
                return (
                  <Link
                    key={group.id}
                    href={group.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                      groupActive
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="size-4" strokeWidth={1.75} />
                    {group.label}
                  </Link>
                );
              }

              return (
                <div key={group.id} className="flex flex-col gap-1">
                  <p className="flex items-center gap-2 px-3 py-1 text-xs font-medium tracking-wider text-muted-foreground uppercase">
                    <Icon className="size-3.5" strokeWidth={1.75} />
                    {group.label}
                  </p>
                  {group.children.map(({ href, label, icon: ChildIcon }) => {
                    const active = isChildActive(
                      pathname,
                      href,
                      group.children,
                    );
                    return (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setOpen(false)}
                        className={cn(
                          "flex min-h-11 touch-manipulation items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors",
                          active
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "text-muted-foreground hover:bg-sidebar-accent/70 hover:text-sidebar-accent-foreground",
                        )}
                      >
                        <ChildIcon className="size-4" strokeWidth={1.75} />
                        {label}
                      </Link>
                    );
                  })}
                </div>
              );
            })}
          </nav>
        </ScrollArea>
        <Separator className="shrink-0" />
        <div className="flex shrink-0 flex-col gap-3 p-3 safe-area-bottom">
          {referralScope ? (
            <ScopedReferralLink referralScope={referralScope} />
          ) : null}
          <form action={logoutAdminAction}>
            <Button
              type="submit"
              variant="ghost"
              className="min-h-11 w-full touch-manipulation justify-start gap-3 text-muted-foreground"
            >
              <LogOut className="size-4" strokeWidth={1.75} />
              Salir
            </Button>
          </form>
        </div>
      </SheetContent>
    </Sheet>
  );
}
