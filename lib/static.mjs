/** Serves the built window from dist/ (ADR 0001): hashed assets cached by the browser for good, the pages never cached, files read once per build. A checkout without a build gets a plain notice. */
import { readFile, stat } from 'node:fs/promises';
import { join, extname } from 'node:path';

const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.map': 'application/json' };
const PAGES = { '/': 'index.html', '/report': 'report.html' };
const UNBUILT = Buffer.from('<!doctype html><meta charset="utf-8"><title>Whose Turn</title><p style="font: 15px system-ui; margin: 40px">The window is not built. Run <code>npm run build</code> in the whose-turn directory, then reload. The API on this port works without it.</p>');

export const createStatic = (distDir) => {
  const cache = new Map();
  const read = async (relative) => {
    const file = join(distDir, relative);
    const { mtimeMs } = await stat(file);
    const hit = cache.get(relative);
    if (hit && hit.mtimeMs === mtimeMs) {
      return hit.body;
    }
    const body = await readFile(file);
    cache.set(relative, { mtimeMs, body });
    return body;
  };
  /** The file for a path, with its type and cache header, or null when the path is not a window file; the unbuilt notice stands in for a missing page. */
  return async (pathname) => {
    const relative = PAGES[pathname] || pathname.replace(/^\/+/, '');
    const type = TYPES[extname(relative)];
    if (!type || relative.split('/').includes('..')) {
      return null;
    }
    const page = Boolean(PAGES[pathname]);
    try {
      return { body: await read(relative), type, cacheControl: page ? 'no-store' : relative.startsWith('assets/') ? 'public, max-age=31536000, immutable' : 'public, max-age=3600' };
    } catch {
      return page ? { body: UNBUILT, type: 'text/html', cacheControl: 'no-store' } : null;
    }
  };
};
