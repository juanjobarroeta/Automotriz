import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'

// El SHA del commit desplegado. Railway lo inyecta; en local queda vacío y
// Sentry simplemente reporta sin release. Es lo que amarra un stack trace con
// los source maps de ESE build — y lo que permite decir "esto se rompió con el
// deploy de ayer" en vez de adivinar.
const release =
  process.env.VITE_SENTRY_RELEASE ||
  process.env.RAILWAY_GIT_COMMIT_SHA ||
  ''

// Sin token no hay a dónde subir los source maps, así que ni se agrega el
// plugin: un clon del repo sin credenciales de Sentry compila igual.
const uploadSourcemaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

export default defineConfig({
  define: {
    'import.meta.env.VITE_SENTRY_RELEASE': JSON.stringify(release),
  },
  build: {
    // Necesarios para que Sentry desminifique. Con
    // `sourcemaps.filesToDeleteAfterUpload` no quedan servidos en público.
    sourcemap: uploadSourcemaps ? true : false,
  },
  plugins: [
    react(),
    ...(uploadSourcemaps
      ? [
          sentryVitePlugin({
            org: process.env.SENTRY_ORG || 'cumplo-id',
            project: process.env.SENTRY_PROJECT || 'automotriz',
            authToken: process.env.SENTRY_AUTH_TOKEN,
            release: { name: release || undefined },
            sourcemaps: {
              // Subirlos y BORRARLOS del dist: si se quedan, cualquiera puede
              // leer el código fuente del satélite desde el navegador.
              filesToDeleteAfterUpload: ['./dist/**/*.map'],
            },
          }),
        ]
      : []),
  ],
})
