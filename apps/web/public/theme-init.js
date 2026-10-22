window.__zod_globalConfig = { jitless: true }
;(() => {
  try {
    const tema = localStorage.getItem('vinimon:tema') || 'sistema'
    const densidade = localStorage.getItem('vinimon:densidade')
    const escuro = tema === 'escuro' || (tema === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches)
    const raiz = document.documentElement
    raiz.classList.toggle('dark', escuro)
    raiz.style.colorScheme = escuro ? 'dark' : 'light'
    if (densidade === 'compacta' || densidade === 'confortavel') raiz.dataset.densidade = densidade
  } catch {}
})()
