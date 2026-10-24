import { cn } from "@/lib/utils";

export function BrandLogos({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-6 rounded-xl bg-card px-4 py-3",
        className,
      )}
    >
      <div className="flex h-14 w-36 shrink-0 items-center justify-center sm:h-16 sm:w-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-cim.png"
          alt="CIM"
          className="max-h-full max-w-full object-contain"
        />
      </div>
      <div className="flex h-14 w-36 shrink-0 items-center justify-center sm:h-16 sm:w-44">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-bera.png"
          alt="Bera Motorcycles"
          className="max-h-full max-w-full object-contain"
        />
      </div>
    </div>
  );
}
