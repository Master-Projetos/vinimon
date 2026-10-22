window.__zod_globalConfig = { jitless: true };
(function () { try {
  var t = localStorage.getItem('vinimon:tema') || 'sistema';
  var d = localStorage.getItem('vinimon:densidade');
  var escuro = t === 'escuro' || (t === 'sistema' && matchMedia('(prefers-color-scheme: dark)').matches);
  var r = document.documentElement;
  r.classList.toggle('dark', escuro); r.style.colorScheme = escuro ? 'dark' : 'light';
  if (d === 'compacta' || d === 'confortavel') r.dataset.densidade = d;
} catch (e) {} })();
