import type { ReactNode } from "react";
import { getMotosAndonCounts } from "@/lib/pipeline/queries";
import { AdminHubSubnav } from "@/components/layout/admin-hub-subnav";
import { PageHeader } from "@/components/layout/page-header";
import { MotosAndonStrip } from "@/components/motos/motos-andon-strip";

export async function MotosHubFrame({
  title,
  description,
  children,
}: {
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  const andon = await getMotosAndonCounts();

  return (
    <div className="flex flex-col gap-6">
      <AdminHubSubnav hubId="motos" />
      <MotosAndonStrip counts={andon} />
      <PageHeader title={title} description={description} />
      {children}
    </div>
  );
}
