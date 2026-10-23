import { useBlocker } from '@tanstack/react-router'

const MENSAGEM = 'Há alterações não salvas. Deseja sair mesmo assim?'

/** Pede confirmação ao navegar (e ao fechar a aba) enquanto `ativo` for verdadeiro. */
export function useAlteracoesNaoSalvas(ativo: boolean): void {
  useBlocker({
    shouldBlockFn: () => ativo && !window.confirm(MENSAGEM),
    enableBeforeUnload: ativo,
    withResolver: false,
  })
}
