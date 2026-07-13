import tailwindcss from '@tailwindcss/vite';
import { devtools } from '@tanstack/devtools-vite';
import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import viteReact from '@vitejs/plugin-react';
import { nitro } from 'nitro/vite';
import { defineConfig } from 'vite';

const config = defineConfig({
  resolve: { tsconfigPaths: true },
  // maplibre-gl is a single ~1 MB lazy-loaded chunk that cannot be split further.
  build: { chunkSizeWarningLimit: 1100 },
  plugins: [
    devtools(),
    nitro({
      plugins: [
        // Boot-time migrations + owner seeding; see src/lib/seed-plugin.ts.
        './src/lib/seed-plugin.ts',
        // Baseline anti-framing/sniffing headers; see
        // src/lib/security-headers-plugin.ts.
        './src/lib/security-headers-plugin.ts',
      ],
    }),
    tailwindcss(),
    tanstackStart(),
    viteReact(),
  ],
});

export default config;
