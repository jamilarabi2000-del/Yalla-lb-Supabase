import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";

if (!process.env.GCLOUD_PROJECT) {
  process.env.GCLOUD_PROJECT = "yalla-lb-2026";
}

const app = express();
const PORT = 3000;

app.use(express.json({ verify: (req: any, _res, buf) => { req.rawBody = buf; } }));

// Security Headers Middleware
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// Health endpoint
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Cloud Functions Gateway for development and container environments
let functionsLibPromise: Promise<any> | null = null;
const getFunctionsLib = async () => {
  if (functionsLibPromise) {
    const cached = await functionsLibPromise;
    if (cached) return cached;
  }
  functionsLibPromise = (async () => {
    try {
      return await import("./functions/src/index");
    } catch {
      try {
        // @ts-ignore
        return await import("./functions/lib/index.js");
      } catch (err) {
        console.warn("[Server Gateway] Could not load functions/lib:", err);
        return null;
      }
    }
  })();
  return functionsLibPromise;
};

app.post("/api/functions/:name", async (req, res) => {
  const lib = await getFunctionsLib();
  const fnName = req.params.name;
  const handler = lib ? lib[fnName] : null;
  if (typeof handler === "function") {
    return handler(req, res);
  }
  return res.status(404).json({
    error: {
      message: `Function ${fnName} not found`,
      status: "NOT_FOUND",
    },
  });
});

app.post("/:projectId/:region/:name", async (req, res, next) => {
  const { projectId, region, name } = req.params;
  if (
    (projectId === "yalla-lb-2026" || projectId.includes("yalla")) &&
    region === "europe-west1"
  ) {
    const lib = await getFunctionsLib();
    const handler = lib ? lib[name] : null;
    if (typeof handler === "function") {
      return handler(req, res);
    }
  }
  next();
});

// Vite middleware setup
async function start() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.use((_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start();
