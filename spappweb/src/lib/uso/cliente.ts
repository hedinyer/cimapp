"use client";

import type { UsoEvento } from "@/lib/uso/describir";

const COOKIE = "uso_sesion";
const cola: UsoEvento[] = [];
let timer: ReturnType<typeof setTimeout> | undefined;

export function sesionUsoNavegador(): string {
  const current = document.cookie
    .split("; ")
    .find((item) => item.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (current && /^[0-9a-f-]{36}$/i.test(current)) return current;
  const id = crypto.randomUUID();
  document.cookie = `${COOKIE}=${id}; path=/; max-age=${60 * 60 * 24 * 7}; samesite=lax`;
  return id;
}

export function anotarUso(evento: UsoEvento): void {
  sesionUsoNavegador();
  cola.push(evento);
  if (cola.length >= 20) {
    void vaciarUso();
    return;
  }
  if (timer) return;
  timer = setTimeout(() => {
    timer = undefined;
    void vaciarUso();
  }, 1500);
}

export function vaciarUso(): void {
  if (cola.length === 0) return;
  const eventos = cola.splice(0, 30);
  const body = JSON.stringify({ eventos });
  if (navigator.sendBeacon) {
    const blob = new Blob([body], { type: "application/json" });
    if (navigator.sendBeacon("/api/uso", blob)) return;
  }
  void fetch("/api/uso", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  });
}
