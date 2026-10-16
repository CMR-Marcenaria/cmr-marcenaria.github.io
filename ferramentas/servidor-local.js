// Servidor estático de teste. Uso: node servidor.js <pasta> [json-de-exemplo]
const http = require("http");
const fs = require("fs");
const path = require("path");
const raiz = path.resolve(process.argv[2]);
const exemplo = process.argv[3];
const tipos = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css", ".json": "application/json; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".jpg": "image/jpeg", ".svg": "image/svg+xml" };
http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, "http://x").pathname);
  if (p.endsWith("/")) p += "index.html";
  let arquivo = path.join(raiz, p);
  if (exemplo && p === "/dados/mesas.json") arquivo = path.resolve(exemplo);
  if (!arquivo.startsWith(raiz) && arquivo !== path.resolve(exemplo || "")) { res.writeHead(403); return res.end(); }
  fs.readFile(arquivo, (err, buf) => {
    if (err) { res.writeHead(404); return res.end("404"); }
    res.writeHead(200, { "Content-Type": tipos[path.extname(arquivo)] || "application/octet-stream" });
    res.end(buf);
  });
}).listen(5500, () => console.log("http://localhost:5500"));
