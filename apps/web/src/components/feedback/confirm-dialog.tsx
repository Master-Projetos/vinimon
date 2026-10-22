import type React from 'react'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ConfirmDialogProps {
  aberto: boolean
  aoMudarAberto: (v: boolean) => void
  titulo: string
  descricao: React.ReactNode
  rotuloConfirmar: string
  destrutivo?: boolean
  aoConfirmar: () => void | Promise<void>
}

export function ConfirmDialog({
  aberto,
  aoMudarAberto,
  titulo,
  descricao,
  rotuloConfirmar,
  destrutivo = false,
  aoConfirmar,
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={aberto} onOpenChange={aoMudarAberto}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{titulo}</AlertDialogTitle>
          <AlertDialogDescription>{descricao}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel autoFocus>Cancelar</AlertDialogCancel>
          <AlertDialogAction variant={destrutivo ? 'destructive' : 'default'} onClick={() => void aoConfirmar()}>
            {rotuloConfirmar}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
