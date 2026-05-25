#!/usr/bin/env node
/* Bestscreen dev server — zero dependencies, just Node's stdlib.
 *   $ npm run dev          → http://localhost:5173
 *   $ npm run dev -- 3000  → http://localhost:3000
 *   $ npm run open         → also opens in default browser
 */
"use strict";

const http = require("http");
const fs   = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const ROOT = __dirname;
const argv = process.argv.slice(2);
const portArg = argv.find(a => /^\d+$/.test(a));
const PORT = parseInt(process.env.PORT || portArg || "5173", 10);
const shouldOpen = argv.includes("--open") || argv.includes("-o");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".fountain": "text/plain; charset=utf-8",
  ".txt":  "text/plain; charset=utf-8",
};

function safeResolve(reqUrl) {
  const decoded = decodeURIComponent(reqUrl.split("?")[0]);
  let p = path.join(ROOT, decoded);
  // Block path traversal
  if (!p.startsWith(ROOT)) return null;
  if (decoded === "/" || decoded === "") p = path.join(ROOT, "index.html");
  return p;
}

const server = http.createServer((req, res) => {
  // API: POST /api/selections — write feature picks to v3-selections.json
  if (req.method === "POST" && req.url === "/api/selections") {
    let body = "";
    req.on("data", chunk => { body += chunk; if (body.length > 1e6) req.destroy(); });
    req.on("end", () => {
      try {
        const data = JSON.parse(body);
        const out = path.join(ROOT, "v3-selections.json");
        fs.writeFileSync(out, JSON.stringify(data, null, 2));
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true, path: out }));
        process.stdout.write(`  ✓ Wrote v3-selections.json (${data.selected?.length || 0} picks)\n`);
      } catch (e) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: false, error: e.message }));
      }
    });
    return;
  }

  let filePath = safeResolve(req.url);
  if (!filePath) { res.writeHead(403); return res.end("Forbidden"); }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end(`Not found: ${req.url}`);
    }
    const ext = path.extname(filePath).toLowerCase();
    const type = MIME[ext] || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Cache-Control": "no-cache",
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  process.stdout.write(`\n  Bestscreen — local dev server\n`);
  process.stdout.write(`  ➜  ${url}\n`);
  process.stdout.write(`  ➜  serving ${ROOT}\n`);
  process.stdout.write(`  ➜  press Ctrl+C to stop\n\n`);

  if (shouldOpen) {
    const cmd = process.platform === "darwin" ? "open"
              : process.platform === "win32"  ? "start"
              : "xdg-open";
    spawn(cmd, [url], { stdio: "ignore", detached: true }).unref();
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    process.stderr.write(`\n  Port ${PORT} is busy. Try: npm run dev -- ${PORT+1}\n\n`);
    process.exit(1);
  }
  throw e;
});

process.on("SIGINT", () => { process.stdout.write("\n  Stopping.\n"); process.exit(0); });
