import { searchClients } from "@/lib/pipeline/queries";
import { ClientesSearchLive } from "@/components/clientes/clientes-search-live";
import { PageHeader } from "@/components/layout/page-header";

export default async function ClientesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; nuevo?: string }>;
}) {
  const { q, nuevo } = await searchParams;
  const query = q?.trim() ?? "";
  // Solo bloquea si hay búsqueda; la cartera se hidrata en cliente.
  const results =
    query.length >= 2 ? await searchClients(query) : [];

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Clientes"
        description="Personas y pipeline: clientes con moto a crédito. Orden: vigilados, mora, recogidos, cancelados. Busca por placa, cédula o nombre."
      />
      <ClientesSearchLive
        initialQuery={query}
        initialResults={results}
        creditClients={[]}
        hydrateCreditList
        initialShowCreate={nuevo === "1"}
      />
    </div>
  );
}
