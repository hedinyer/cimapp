import { getVentasContado } from "@/lib/actions/venta-moto-actions";
import { getAvailableBikes } from "@/lib/pipeline/queries";
import { VentaContadoManager } from "@/components/venta-contado/venta-contado-manager";
import { MotosHubFrame } from "@/components/motos/motos-hub-frame";

export default async function VentaContadoPage({
  searchParams,
}: {
  searchParams: Promise<{
    nuevo?: string;
    bikeId?: string;
    modelo?: string;
    color?: string;
  }>;
}) {
  const params = await searchParams;
  const [ventas, bikes] = await Promise.all([
    getVentasContado(),
    getAvailableBikes(),
  ]);

  let initialBikeId = params.bikeId?.trim() || undefined;
  if (!initialBikeId && params.modelo?.trim() && params.color?.trim()) {
    const match = bikes.find(
      (b) =>
        b.modelo === params.modelo?.trim() &&
        b.color === params.color?.trim(),
    );
    if (match) initialBikeId = String(match.id);
  }

  return (
    <MotosHubFrame
      title="Contado"
      description="Motos vendidas al contado o con abono parcial en mostrador."
    >
      <VentaContadoManager
        ventas={ventas}
        bikes={bikes}
        openNuevo={params.nuevo === "1"}
        initialBikeId={initialBikeId}
      />
    </MotosHubFrame>
  );
}
