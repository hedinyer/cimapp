import { getAllBikes, getAllGarajeMotos } from "@/lib/pipeline/queries";
import { countStockSegundaMano } from "@/lib/garaje/stock-segunda";
import { CatalogoManager } from "@/components/catalogo/catalogo-manager";
import { MotosHubFrame } from "@/components/motos/motos-hub-frame";

export const dynamic = "force-dynamic";

export default async function CatalogoPage() {
  const [bikes, motosGaraje] = await Promise.all([
    getAllBikes(),
    getAllGarajeMotos(),
  ]);
  const stockSegunda = countStockSegundaMano(motosGaraje);

  return (
    <MotosHubFrame
      title="Referencia"
      description="Plantilla del catálogo: precios y stock. El patio y la venta se gestionan en Garaje y Contado."
    >
      <CatalogoManager bikes={bikes} stockSegunda={stockSegunda} />
    </MotosHubFrame>
  );
}
