window.__zod_globalConfig = { jitless: true }
;(() => {
  try {
    // O app grava JSON (lib/storage.ts): "escuro" com aspas.
    const ler = (chave) => {
      const bruto = localStorage.getItem(chave)
      try {
        return bruto === null ? null : JSON.parse(bruto)
      } catch {
        return bruto
      }
    }
    const tema = ler('vinimon:tema') || 'sistema'
    const densidade = ler('vinimon:densidade')
    const escuro = tema === 'escuro' || (tema === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
    const raiz = document.documentElement
    raiz.classList.toggle('dark', escuro)
    raiz.style.colorScheme = escuro ? 'dark' : 'light'
    if (densidade === 'compacta' || densidade === 'confortavel') raiz.dataset.densidade = densidade
  } catch {}
})()
