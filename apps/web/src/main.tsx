import '@fontsource-variable/inter'
import '@fontsource-variable/jetbrains-mono'
import './styles/globals.css'
import { QueryClientProvider } from '@tanstack/react-query'
import { RouterProvider } from '@tanstack/react-router'
import { configurarZod } from '@vinimon/shared'
import { createRoot } from 'react-dom/client'
import { toast } from 'sonner'
import { DensityProvider } from '@/components/theme/density-provider'
import { ThemeProvider } from '@/components/theme/theme-provider'
import { Toaster } from '@/components/ui/sonner'
import { authChaves, authConsultas } from '@/features/auth/queries'
import { definirRenovadorCsrf } from '@/lib/api'
import { criarQueryClient } from '@/lib/query-client'
import { criarRouter } from './router'

configurarZod()

const queryClient = criarQueryClient(() => {
  queryClient.setQueryData(authChaves.sessao, null)
  void router.navigate({ to: '/login', search: { redirect: window.location.pathname } })
  toast('Sua sessão expirou. Entre novamente.')
})
const router = criarRouter(queryClient)

definirRenovadorCsrf(async () => {
  await queryClient.fetchQuery({ ...authConsultas.sessao(), staleTime: 0 })
})

createRoot(document.getElementById('root') as HTMLElement).render(
  <ThemeProvider>
    <DensityProvider>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <Toaster />
      </QueryClientProvider>
    </DensityProvider>
  </ThemeProvider>,
)
