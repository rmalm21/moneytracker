import path from 'node:path';
import type { NextConfig } from 'next';
const nextConfig: NextConfig = {
  output: 'export', trailingSlash: true, reactStrictMode: true,
  // Same isolation headers as firebase.json in development, so the receipt reader runs with several threads here too.
  ...(process.env.NODE_ENV === 'development' ? { headers: async () => [{ source: '/:path*', headers: [{ key: 'Cross-Origin-Opener-Policy', value: 'same-origin' }, { key: 'Cross-Origin-Embedder-Policy', value: 'require-corp' }] }] } : {}),
  // OpenCV.js (inside the PaddleOCR.js receipt reader) mentions Node's fs/path/crypto for its Node build; the browser
  // build never uses them.
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve.fallback = { ...config.resolve.fallback, fs: false, path: false, crypto: false };
      // ONNX Runtime Web: the plain WASM build only (its runtime files are served from /ocr/ort; no WebGPU/JSEP build).
      config.resolve.alias = { ...config.resolve.alias, 'onnxruntime-web$': path.join(process.cwd(), 'node_modules/onnxruntime-web/dist/ort.wasm.min.mjs') };
    }
    return config;
  },
};
export default nextConfig;
