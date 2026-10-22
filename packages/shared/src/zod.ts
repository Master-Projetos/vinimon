import { z } from 'zod'

/** Mensagens de erro em pt-BR. O jitless do front vem de public/theme-init.js (window.__zod_globalConfig). */
export function configurarZod(): void {
  z.config(z.locales.ptBR())
}
