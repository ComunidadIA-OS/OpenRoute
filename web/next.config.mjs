/** @type {import('next').NextConfig} */
const nextConfig = {
  // El output 'standalone' genera un bundle autosuficiente en .next/standalone
  // que el Dockerfile de producción copia directamente, sin node_modules.
  // Reduce el tamaño de la imagen final de ~1.2 GB a ~150 MB y acelera el
  // arranque del contenedor. No afecta a `next dev` local.
  output: "standalone",
};

export default nextConfig;
