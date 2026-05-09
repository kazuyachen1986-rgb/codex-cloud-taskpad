import http from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const root = process.cwd();
const publicDir = path.join(root, "public");
const dataDir = process.env.DATA_DIR || path.join(root, "data");
const tasksPath = path.join(dataDir, "tasks.json");
const accessCodePath = path.join(dataDir, "access-code.txt");
const port = Number(process.env.PORT || 3007);
const configuredAccessCode = String(process.env.ACCESS_CODE || "").trim();

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json; charset=utf-8"
};

async function ensureStore() {
  await mkdir(dataDir, { recursive: true });
  if (!existsSync(tasksPath)) {
    await writeFile(tasksPath, "[]\n", "utf8");
  }
  if (!existsSync(accessCodePath)) {
    const code = configuredAccessCode || crypto.randomBytes(4).toString("hex").toUpperCase();
    await writeFile(accessCodePath, `${code}\n`, "utf8");
  }
}

async function readTasks() {
  await ensureStore();
  const raw = await readFile(tasksPath, "utf8");
  return JSON.parse(raw || "[]");
}

async function writeTasks(tasks) {
  await ensureStore();
  await writeFile(tasksPath, `${JSON.stringify(tasks, null, 2)}\n`, "utf8");
}

async function getAccessCode() {
  if (configuredAccessCode) return configuredAccessCode;
  await ensureStore();
  return (await readFile(accessCodePath, "utf8")).trim();
}

async function isAuthorized(req) {
  return req.headers["x-access-code"] === await getAccessCode();
}

function sendJson(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1_000_000) {
        req.destroy();
        reject(new Error("Request is too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

async function handleApi(req, res) {
  if (req.url === "/api/status" && req.method === "GET") {
    sendJson(res, 200, {
      ok: true,
      name: "Codex Cloud Taskpad",
      needsAccessCode: true
    });
    return;
  }

  if (req.url === "/api/session" && req.method === "POST") {
    const body = JSON.parse(await readBody(req) || "{}");
    if (String(body.accessCode || "").trim() === await getAccessCode()) {
      sendJson(res, 200, { ok: true });
      return;
    }
    sendJson(res, 401, { error: "Wrong access code." });
    return;
  }

  if (!await isAuthorized(req)) {
    sendJson(res, 401, { error: "Access code required." });
    return;
  }

  if (req.url === "/api/tasks" && req.method === "GET") {
    sendJson(res, 200, { tasks: await readTasks() });
    return;
  }

  if (req.url === "/api/tasks" && req.method === "POST") {
    const body = JSON.parse(await readBody(req) || "{}");
    const title = String(body.title || "").trim();
    const message = String(body.message || "").trim();
    const priority = ["normal", "high"].includes(body.priority) ? body.priority : "normal";

    if (!title && !message) {
      sendJson(res, 400, { error: "Write a task first." });
      return;
    }

    const now = new Date().toISOString();
    const task = {
      id: crypto.randomUUID(),
      title: title || message.slice(0, 72),
      message,
      priority,
      status: "new",
      createdAt: now,
      updatedAt: now,
      notes: []
    };

    const tasks = await readTasks();
    tasks.unshift(task);
    await writeTasks(tasks);
    sendJson(res, 201, { task });
    return;
  }

  const match = req.url.match(/^\/api\/tasks\/([^/]+)$/);
  if (match && req.method === "PATCH") {
    const body = JSON.parse(await readBody(req) || "{}");
    const tasks = await readTasks();
    const index = tasks.findIndex((task) => task.id === match[1]);
    if (index === -1) {
      sendJson(res, 404, { error: "Task not found." });
      return;
    }

    if (["new", "accepted", "working", "done"].includes(body.status)) {
      tasks[index].status = body.status;
    }
    if (typeof body.note === "string" && body.note.trim()) {
      tasks[index].notes.unshift({
        id: crypto.randomUUID(),
        body: body.note.trim(),
        createdAt: new Date().toISOString()
      });
    }

    tasks[index].updatedAt = new Date().toISOString();
    await writeTasks(tasks);
    sendJson(res, 200, { task: tasks[index] });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

async function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const safePath = path.normalize(requestPath).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  try {
    const data = await readFile(filePath);
    const ext = path.extname(filePath);
    res.writeHead(200, {
      "content-type": mimeTypes[ext] || "application/octet-stream",
      "cache-control": ext === ".html" ? "no-store" : "public, max-age=3600"
    });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith("/api/")) {
      await handleApi(req, res);
      return;
    }
    await serveStatic(req, res);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Server error" });
  }
});

await ensureStore();
server.listen(port, "0.0.0.0", () => {
  console.log(`Codex Cloud Taskpad is running on port ${port}`);
  if (!configuredAccessCode) {
    getAccessCode().then((code) => console.log(`Access code: ${code}`));
  }
});
