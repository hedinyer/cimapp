import Link from "next/link";
import { ArrowRight } from "lucide-react";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { InboxQueue, InboxQueueId } from "@/lib/pipeline/types";
import { cn } from "@/lib/utils";

const URGENT_QUEUES = new Set<InboxQueueId>(["morosos", "recoger"]);

interface QueueCardsProps {
  queues: InboxQueue[];
}

function sortQueues(queues: InboxQueue[]): InboxQueue[] {
  return [...queues].sort((a, b) => {
    const aWork = a.count > 0 ? 1 : 0;
    const bWork = b.count > 0 ? 1 : 0;
    if (bWork !== aWork) return bWork - aWork;
    if (b.count !== a.count) return b.count - a.count;
    return a.id.localeCompare(b.id);
  });
}

export function QueueCards({ queues }: QueueCardsProps) {
  const ordered = sortQueues(queues);

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {ordered.map((queue) => (
        <QueueCard key={queue.id} queue={queue} />
      ))}
    </div>
  );
}

function QueueCard({ queue }: { queue: InboxQueue }) {
  const href =
    queue.id === "solicitudes_taller"
      ? "/solicitudes"
      : `/inbox?cola=${queue.id}`;
  const hasWork = queue.count > 0;
  const urgent = hasWork && URGENT_QUEUES.has(queue.id);
  const ariaLabel = hasWork
    ? `${queue.label}: ${queue.count} pendiente${queue.count === 1 ? "" : "s"}`
    : `${queue.label}: al día`;

  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="group block rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card
        className={cn(
          "h-full transition-[transform,background-color,box-shadow] duration-150 ease-out",
          "active:scale-[0.96]",
          hasWork
            ? urgent
              ? "bg-destructive/5 ring-destructive/25 group-hover:bg-destructive/10"
              : "bg-primary/5 ring-primary/20 group-hover:bg-primary/10"
            : "group-hover:bg-muted/40",
        )}
      >
        <CardHeader className="gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <CardTitle className="text-base font-semibold leading-snug">
                {queue.label}
              </CardTitle>
              <CardDescription className="text-pretty">
                {queue.description}
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <span
                className={cn(
                  "font-heading text-3xl font-semibold tabular-nums leading-none sm:text-4xl",
                  hasWork
                    ? urgent
                      ? "text-destructive"
                      : "text-foreground"
                    : "text-muted-foreground",
                )}
              >
                {queue.count}
              </span>
              {hasWork ? (
                <Badge variant={urgent ? "destructive" : "secondary"}>
                  Pendiente
                </Badge>
              ) : null}
              <ArrowRight
                className="size-5 text-muted-foreground transition-transform duration-150 ease-out group-hover:translate-x-0.5"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </div>
          </div>
        </CardHeader>
      </Card>
    </Link>
  );
}

export function queueTitle(id: InboxQueueId): string {
  const map: Record<InboxQueueId, string> = {
    creditos: "Clientes sin visita",
    clientes_guillen: "Solicitudes (captador)",
    visitas_sin_asignar: "Visitas sin asignar",
    visitas_programadas: "Visitas programadas",
    pagos: "Pagos por confirmar",
    retiro: "Preparar retiro",
    entrega: "Registrar entrega",
    morosos: "Clientes en mora",
    recoger: "Motos para recoger",
    solicitudes_taller: "Solicitudes de taller",
  };
  return map[id];
}
