"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  adminNavGroups,
  isChildActive,
  type AdminNavGroup,
} from "@/components/layout/admin-nav-links";
import { cn } from "@/lib/utils";

export function AdminHubSubnav({ hubId }: { hubId: AdminNavGroup["id"] }) {
  const pathname = usePathname();
  const group = adminNavGroups.find((g) => g.id === hubId);
  if (!group || group.children.length === 0) return null;

  return (
    <nav
      aria-label={`${group.label}: secciones`}
      className="flex w-full flex-wrap gap-1 rounded-xl bg-muted p-1 lg:flex-nowrap"
    >
      {group.children.map(({ href, label }) => {
        const active = isChildActive(pathname, href, group.children);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex min-h-11 touch-manipulation items-center justify-center rounded-lg px-3 py-2 text-center text-sm font-medium text-balance transition-[color,transform,box-shadow] active:scale-[0.96] lg:min-w-0 lg:flex-1",
              active
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
