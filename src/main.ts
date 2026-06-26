import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

// Cuando un chunk JS ya no existe en el servidor (tras un redespliegue),
// el navegador lanza "Failed to fetch dynamically imported module".
// En ese caso recargamos la página UNA sola vez para obtener la versión nueva.
window.addEventListener('error', (event) => {
  const msg: string = event.message ?? '';
  if (msg.includes('dynamically imported module') || msg.includes('Importing a module script failed')) {
    const reloaded = sessionStorage.getItem('__chunk_reload__');
    if (!reloaded) {
      sessionStorage.setItem('__chunk_reload__', '1');
      window.location.reload();
    }
  }
});

bootstrapApplication(App, appConfig)
  .catch((err) => console.error(err));
