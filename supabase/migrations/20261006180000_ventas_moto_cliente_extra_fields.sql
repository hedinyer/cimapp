-- Campos de cliente en venta de moto al contado (alineado con panel / BGA)
ALTER TABLE public.ventas_moto
  ADD COLUMN IF NOT EXISTS cliente_tipo_documento text,
  ADD COLUMN IF NOT EXISTS cliente_direccion text,
  ADD COLUMN IF NOT EXISTS cliente_correo text,
  ADD COLUMN IF NOT EXISTS cliente_foto_url text;

COMMENT ON COLUMN public.ventas_moto.cliente_tipo_documento IS 'cc | ce | nit | pasaporte | otro';
COMMENT ON COLUMN public.ventas_moto.cliente_direccion IS 'Dirección del comprador';
COMMENT ON COLUMN public.ventas_moto.cliente_correo IS 'Correo del comprador';
COMMENT ON COLUMN public.ventas_moto.cliente_foto_url IS 'URL de foto del comprador en storage';
