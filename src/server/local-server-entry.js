// Local static file server for bazel-git-lfs checkout @.
// Serves .bazel_git_lfs/objects over HTTP so Bazel can fetch mirrored
// dependencies from http://localhost:8022/... This file runs as a detached
// background process and is launched by src/server/local-server.ts.
const http = require('http');
const fs = require('fs');
const path = require('path');
const url = require('url');

const objectsDir = process.argv[2];
const port = Number(process.argv[3] || 8022);

const MIME = {
  '.zip': 'application/zip',
  '.tgz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.gz': 'application/gzip',
  '.bz2': 'application/x-bzip2',
  '.xz': 'application/x-xz',
  '.sha256': 'text/plain',
};

const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(url.parse(req.url).pathname);
  // Reject anything that escapes the objects root.
  const filePath = path.normalize(path.join(objectsDir, pathname));
  if (!filePath.startsWith(objectsDir + path.sep) && filePath !== objectsDir) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stat) => {
    if (err || !stat.isFile()) {
      res.writeHead(404);
      res.end('Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Content-Length': stat.size,
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(port, '127.0.0.1', () => {
  // Signal readiness is implicit (the launcher polls the port).
});

process.on('SIGTERM', () => server.close(() => process.exit(0)));
process.on('SIGINT', () => server.close(() => process.exit(0)));
