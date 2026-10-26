import { useState } from 'react'
import { Button } from '@/components/ui/button'

/** Pede a permissão do navegador só depois do clique (§3.8). Some quando já foi concedida ou negada. */
export function DesktopNotificationsPrompt() {
  const [permissao, setPermissao] = useState<NotificationPermission | 'indisponivel'>(() =>
    typeof Notification === 'undefined' ? 'indisponivel' : Notification.permission,
  )
  if (permissao !== 'default') return null
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void Notification.requestPermission().then(setPermissao)}
    >
      Ativar notificações na área de trabalho
    </Button>
  )
}
