import { Markdown } from '@/components/display/markdown'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

export interface MarkdownEditorProps {
  id?: string
  value: string
  onChange: (valor: string) => void
  onBlur?: () => void
  placeholder?: string
  desabilitado?: boolean
  'aria-invalid'?: boolean
  'aria-describedby'?: string
}

/** Editor de Markdown com abas Escrever e Visualizar. A prévia passa pelo `Markdown` seguro. */
export function MarkdownEditor({
  id,
  value,
  onChange,
  onBlur,
  placeholder,
  desabilitado,
  'aria-invalid': invalido,
  'aria-describedby': descritoPor,
}: MarkdownEditorProps) {
  return (
    <Tabs defaultValue="escrever" className="w-full">
      <TabsList>
        <TabsTrigger value="escrever">Escrever</TabsTrigger>
        <TabsTrigger value="visualizar">Visualizar</TabsTrigger>
      </TabsList>
      <TabsContent value="escrever">
        <Textarea
          id={id}
          rows={6}
          value={value}
          placeholder={placeholder}
          disabled={desabilitado}
          aria-invalid={invalido}
          aria-describedby={descritoPor}
          onBlur={onBlur}
          onChange={(evento) => onChange(evento.target.value)}
        />
      </TabsContent>
      <TabsContent value="visualizar" className="min-h-24 rounded-md border p-3">
        {value.trim() === '' ? (
          <p className="text-sm text-muted-foreground">Nada para visualizar.</p>
        ) : (
          <Markdown texto={value} />
        )}
      </TabsContent>
    </Tabs>
  )
}
