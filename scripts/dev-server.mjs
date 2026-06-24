import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";

const root = resolve(".");
const port = Number(process.env.PORT || 4177);
const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function safePath(urlPath) {
  const decoded = decodeURIComponent(urlPath.split("?")[0]);
  const initialPath = decoded === "/" ? "/public/index.html" : decoded;
  const candidate = normalize(join(root, initialPath));
  if (!candidate.startsWith(root)) return resolve(root, "public", "index.html");
  if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  const publicCandidate = normalize(join(root, "public", initialPath));
  if (publicCandidate.startsWith(root) && existsSync(publicCandidate) && statSync(publicCandidate).isFile()) {
    return publicCandidate;
  }
  return resolve(root, "public", "index.html");
}

createServer((request, response) => {
  const filePath = safePath(request.url || "/");
  response.setHeader("Content-Type", mimeTypes[extname(filePath)] || "application/octet-stream");
  createReadStream(filePath).pipe(response);
}).listen(port, "127.0.0.1", () => {
  console.log(`MACOKASA local app running at http://127.0.0.1:${port}/`);
});
