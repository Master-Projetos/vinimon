import { z } from 'zod'

/** Limites da tabela S56. Cada construtor devolve um schema novo. */
export const zAssunto = () =>
  z.string().min(3, { error: 'Use de 3 a 150 caracteres.' }).max(150, { error: 'Use de 3 a 150 caracteres.' })

export const zDescricao = () => z.string().max(20_000, { error: 'Use no máximo 20.000 caracteres.' })

export const zComentario = () => z.string().max(10_000, { error: 'Use no máximo 10.000 caracteres.' })

export const zSolucao = () => z.string().max(20_000, { error: 'Use no máximo 20.000 caracteres.' })

export const zNome = () =>
  z.string().min(2, { error: 'Use de 2 a 120 caracteres.' }).max(120, { error: 'Use de 2 a 120 caracteres.' })

export const zEmail = () =>
  z.email({ error: 'Informe um e-mail válido.' }).max(254, { error: 'Use no máximo 254 caracteres.' })

export const zTelefone = () =>
  z
    .string()
    .max(30, { error: 'Use no máximo 30 caracteres.' })
    .regex(/^[0-9+()\- ]*$/, { error: 'Use apenas números, espaços e os símbolos + ( ) -.' })

export const zContato = () => z.string().max(120, { error: 'Use no máximo 120 caracteres.' })

export const zBusca = () =>
  z.string().min(2, { error: 'Use de 2 a 100 caracteres.' }).max(100, { error: 'Use de 2 a 100 caracteres.' })

export const zNomeArquivo = () => z.string().max(200, { error: 'Use no máximo 200 caracteres.' })

export const zCor = () => z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Use a cor no formato #RRGGBB.' })

export const zTag = () =>
  z.string().min(1, { error: 'Use de 1 a 30 caracteres.' }).max(30, { error: 'Use de 1 a 30 caracteres.' })

export const zMotivo = () =>
  z.string().min(5, { error: 'Use de 5 a 2.000 caracteres.' }).max(2_000, { error: 'Use de 5 a 2.000 caracteres.' })
