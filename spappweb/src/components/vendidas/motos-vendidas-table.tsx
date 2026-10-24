import { User } from "lucide-react";
import type { GarajeMotoVendidaRow } from "@/lib/pipeline/types";
import { GARAJE_CONDICION_LABELS } from "@/lib/pipeline/types";
import { formatDate } from "@/lib/utils/format";
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@/components/ui/empty";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function Selfie({ src, alt }: { src: string | null; alt: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        className="photo-edge h-11 w-11 shrink-0 rounded-lg object-cover"
      />
    );
  }
  return (
    <div
      className="photo-edge flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"
      aria-hidden="true"
    >
      <User className="h-4 w-4" />
    </div>
  );
}

function clienteLabel(m: GarajeMotoVendidaRow): string {
  return m.clienteNombre?.trim() || m.placa || "Cliente";
}

export function MotosVendidasTable({
  motos,
}: {
  motos: GarajeMotoVendidaRow[];
}) {
  if (motos.length === 0) {
    return (
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Sin historial</EmptyTitle>
          <EmptyDescription>
            Cuando una unidad de garaje se entregue o se marque vendida, aparece
            aquí.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <>
      <div className="hidden overflow-x-auto rounded-lg border border-border lg:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Cliente</TableHead>
              <TableHead>Placa</TableHead>
              <TableHead>Unidad</TableHead>
              <TableHead>Color</TableHead>
              <TableHead>Condición</TableHead>
              <TableHead>Fecha de venta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {motos.map((m) => (
              <TableRow key={m.id}>
                <TableCell>
                  <div className="flex items-center gap-3">
                    <Selfie
                      src={m.selfieUrl}
                      alt={`Foto de ${clienteLabel(m)}`}
                    />
                    <span className="font-medium">{clienteLabel(m)}</span>
                  </div>
                </TableCell>
                <TableCell className="font-medium">{m.placa ?? "—"}</TableCell>
                <TableCell>
                  <div className="min-w-0">
                    <p className="font-medium">{m.modelo}</p>
                    {m.referencia && m.referencia !== m.modelo ? (
                      <p className="text-xs text-muted-foreground">
                        {m.referencia}
                      </p>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell>{m.color}</TableCell>
                <TableCell>{GARAJE_CONDICION_LABELS[m.condicion]}</TableCell>
                <TableCell>{formatDate(m.fechaVenta)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-col gap-3 lg:hidden">
        {motos.map((m) => (
          <article
            key={m.id}
            className="rounded-lg border border-border p-4 text-sm"
          >
            <div className="flex items-start gap-3">
              <Selfie src={m.selfieUrl} alt={`Foto de ${clienteLabel(m)}`} />
              <div className="min-w-0 flex-1">
                <p className="font-medium">{clienteLabel(m)}</p>
                <p className="text-muted-foreground">
                  {m.placa ?? "Sin placa"} · {m.modelo} · {m.color}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {GARAJE_CONDICION_LABELS[m.condicion]}
                  {m.fechaVenta ? ` · ${formatDate(m.fechaVenta)}` : ""}
                </p>
              </div>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
