// Sin 'use client': se usa desde layouts del servidor como texto.
/**
 * Script para el <head>: guarda el aviso de instalación de Chrome/Android aunque llegue antes de
 * que React cargue (si no, se pierde y el botón no puede abrirlo).
 */
export const INSTALL_CAPTURE_SCRIPT =
  "window.addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__clumeraInstall=e;window.dispatchEvent(new Event('clumera:installable'))});" +
  "window.addEventListener('appinstalled',function(){window.__clumeraInstall=null});";
