// Servidor de producción para Render (Web Service)
const http = require('http');
const path = require('path');
const fs   = require('fs');
const serveStatic = require('serve-static');
const finalhandler = require('finalhandler');

const PORT   = process.env.PORT || 4200;
const DIST   = path.join(__dirname, 'dist', 'ProvisionesSantaMartha', 'browser');
const INDEX  = path.join(DIST, 'index.html');

const serve = serveStatic(DIST, { index: ['index.html'] });

const server = http.createServer((req, res) => {
  serve(req, res, () => {
    // SPA fallback: todas las rutas devuelven index.html
    fs.createReadStream(INDEX).pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor escuchando en http://0.0.0.0:${PORT}`);
});
