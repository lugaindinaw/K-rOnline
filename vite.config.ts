import type { IncomingMessage, ServerResponse } from "node:http";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vitest/config";

const OVERPASS_UPSTREAMS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.openstreetmap.fr/api/interpreter",
];

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer | string) => {
      chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function osmOverpassProxy(): Plugin {
  const middleware = async (
    req: IncomingMessage,
    res: ServerResponse,
    next: (error?: unknown) => void,
  ) => {
    const url = req.url ?? "";
    if (req.method !== "POST" || !url.startsWith("/osm/overpass")) {
      next();
      return;
    }

    const body = await readBody(req);
    for (const endpoint of OVERPASS_UPSTREAMS) {
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
            "User-Agent": "KorOnline-prototype/0.1 (local educational prototype)",
          },
          body,
          signal: AbortSignal.timeout(18000),
        });
        if ([406, 429, 502, 503, 504].includes(response.status)) {
          continue;
        }
        const text = await response.text();
        if (/"remark"\s*:\s*"[^"]*error/i.test(text)) {
          continue;
        }
        res.statusCode = response.status;
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(text);
        return;
      } catch {
        continue;
      }
    }

    res.statusCode = 503;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ remark: "error: overpass busy" }));
  };

  return {
    name: "osm-overpass-proxy",
    configureServer(server) {
      server.middlewares.use(middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware);
    },
  };
}

export default defineConfig({
  plugins: [react(), osmOverpassProxy()],
  server: {
    port: 5173,
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
  },
});
