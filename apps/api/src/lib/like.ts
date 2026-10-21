// usar em TODO `contains` com texto livre (T62 garante)
export const escaparLike = (texto: string) => texto.replace(/[\\%_]/g, (c) => `\\${c}`)
