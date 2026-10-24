import path from "node:path";
import type { NextConfig } from "next";

const allowedDevOrigins = (process.env.ALLOWED_DEV_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

const appRoot = path.join(__dirname);

const nextConfig: NextConfig = {
  // El git root puede estar en el padre del package. Sin esto, Turbopack
  // a veces arma mal el árbol de rutas y todas las páginas responden 404.
  // outputFileTracingRoot y turbopack.root tienen que ser el mismo valor
  // (Vercel avisa y el build puede quedar raro si no coinciden).
  outputFileTracingRoot: appRoot,
  turbopack: {
    root: appRoot,
  },
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
  reactCompiler: true,
  serverExternalPackages: ["sharp", "unpdf", "xlsx"],
  experimental: {
    serverActions: {
      // Fotos de cámara móvil pueden superar 1 MB (límite por defecto de Next.js)
      bodySizeLimit: "15mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "*.supabase.co",
        pathname: "/storage/v1/object/public/**",
      },
    ],
  },
};

export default nextConfig;
