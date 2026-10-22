import { z } from 'zod'

// Limites de entrada (S56). Toda string que chega do cliente passa por um destes construtores.
export const zAssunto = () =>
  z.string().trim().min(3, { error: 'Use de 3 a 150 caracteres.' }).max(150, { error: 'Use de 3 a 150 caracteres.' })
export const zDescricao = () =>
  z.string().trim().min(1, { error: 'Informe a descrição.' }).max(20_000, { error: 'Máximo de 20.000 caracteres.' })
export const zComentario = () =>
  z.string().trim().min(1, { error: 'Escreva o comentário.' }).max(10_000, { error: 'Máximo de 10.000 caracteres.' })
export const zSolucao = () =>
  z.string().trim().min(1, { error: 'Descreva a solução.' }).max(20_000, { error: 'Máximo de 20.000 caracteres.' })
export const zNome = () =>
  z.string().trim().min(2, { error: 'Use de 2 a 120 caracteres.' }).max(120, { error: 'Use de 2 a 120 caracteres.' })
export const zEmail = () => z.email({ error: 'E-mail inválido.' }).max(254, { error: 'Máximo de 254 caracteres.' })
export const zTelefone = () =>
  z
    .string()
    .trim()
    .max(30, { error: 'Máximo de 30 caracteres.' })
    .regex(/^[0-9+()\- ]*$/, { error: 'Use só dígitos, +, parênteses, hífen e espaço.' })
export const zContato = () => z.string().trim().max(120, { error: 'Máximo de 120 caracteres.' })
export const zBusca = () =>
  z.string().trim().min(2, { error: 'Digite ao menos 2 caracteres.' }).max(100, { error: 'Máximo de 100 caracteres.' })
export const zNomeArquivo = () => z.string().trim().min(1).max(200, { error: 'Nome de arquivo muito longo.' })
export const zCor = () => z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: 'Use uma cor no formato #RRGGBB.' })
export const zTag = () =>
  z.string().trim().min(1, { error: 'Informe a tag.' }).max(30, { error: 'Máximo de 30 caracteres.' })
export const zMotivo = () =>
  z
    .string()
    .trim()
    .min(5, { error: 'Use de 5 a 2.000 caracteres.' })
    .max(2_000, { error: 'Use de 5 a 2.000 caracteres.' })
