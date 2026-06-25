const host = typeof window !== 'undefined' ? window.location.hostname : 'localhost';

export const environment = {
  production: false,
  apiUrl: `http://${host}:8081/api`,
  googleClientId: '509130416997-v65lse6q7fcfoh8qhq8jbgi6anuu2k3p.apps.googleusercontent.com',
  /** Habilita/deshabilita el botón de Autocompletar con OCR en Mis Datos */
  ocrAutocompletarEnabled: false
};
