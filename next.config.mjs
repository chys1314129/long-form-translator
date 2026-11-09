/** @type {import('next').NextConfig} */
// GitHub Pages project sites are served from /<repo>, so the workflow passes
// NEXT_PUBLIC_BASE_PATH. User/org pages (<owner>.github.io) leave it empty.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || '';

const nextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default nextConfig;
