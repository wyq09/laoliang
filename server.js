const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const rootDirectory = __dirname;
const port = Number(process.env.PORT || 8080);
const pricingSource = "https://api-docs.deepseek.com/zh-cn/quick_start/pricing/";

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

function decodeHtml(value) {
  return value
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, "\"")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function parseCurrency(value) {
  const match = value.match(/(\d+(?:\.\d+)?)\s*元/i);
  return match ? Number(match[1]) : null;
}

function parsePricingHtml(rawHtml) {
  const html = rawHtml.replace(/\0/g, "");
  const table = [...html.matchAll(/<table\b[^>]*>([\s\S]*?)<\/table>/gi)]
    .map((match) => match[1])
    .find((content) => /deepseek-v4-flash/i.test(content) && /deepseek-v4-pro/i.test(content));

  if (!table) throw new Error("官方页面中未找到 V4 定价表");

  const rows = [...table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)].map((rowMatch) =>
    [...rowMatch[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((cellMatch) => decodeHtml(cellMatch[1])),
  );

  const models = {
    "deepseek-v4-flash": {},
    "deepseek-v4-pro": {},
  };
  const modelOrder = rows
    .find((cells) => cells.some((cell) => /deepseek-v4-flash/i.test(cell)) && cells.some((cell) => /deepseek-v4-pro/i.test(cell)))
    ?.filter((cell) => /^deepseek-v4-(?:flash|pro)$/i.test(cell))
    .map((cell) => cell.toLowerCase());
  if (!modelOrder || modelOrder.length !== 2) throw new Error("官方定价表的模型列无法识别");

  const rowTypes = [
    { pattern: /输入.*缓存命中|缓存命中.*输入/, key: "cacheHitInput" },
    { pattern: /输入.*缓存未命中|缓存未命中.*输入/, key: "input" },
    { pattern: /(?:百万\s*tokens?\s*)?输出/i, key: "output" },
  ];

  rows.forEach((cells) => {
    const type = rowTypes.find(({ pattern }) => cells.some((cell) => pattern.test(cell)));
    if (!type) return;
    const prices = cells.map(parseCurrency).filter(Number.isFinite);
    if (prices.length < 2) return;
    modelOrder.forEach((modelName, index) => {
      models[modelName][type.key] = prices[index];
    });
  });

  const complete = Object.values(models).every((model) =>
    [model.cacheHitInput, model.input, model.output].every(Number.isFinite),
  );
  if (!complete) throw new Error("官方定价表结构已变化，无法完整读取价格");
  return models;
}

async function fetchOfficialPricing(fetchImplementation = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetchImplementation(pricingSource, {
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "zh-CN,zh;q=0.9",
        "User-Agent": "Mozilla/5.0 DeepSeek-Price-Monitor/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`官方定价页返回 ${response.status}`);
    const models = parsePricingHtml(await response.text());
    return { models, fetchedAt: new Date().toISOString(), source: pricingSource };
  } finally {
    clearTimeout(timeout);
  }
}

function sendJson(response, status, payload) {
  response.writeHead(status, {
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store",
    "Content-Type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(payload));
}

function serveStatic(request, response, pathname) {
  let decodedPath;
  try {
    decodedPath = decodeURIComponent(pathname);
  } catch (_) {
    response.writeHead(400).end("Bad request");
    return;
  }

  const requestedPath = decodedPath === "/" ? "/index.html" : decodedPath;
  const filePath = path.resolve(rootDirectory, `.${requestedPath}`);
  if (filePath !== rootDirectory && !filePath.startsWith(`${rootDirectory}${path.sep}`)) {
    response.writeHead(403).end("Forbidden");
    return;
  }

  fs.stat(filePath, (error, stats) => {
    if (error || !stats.isFile()) {
      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" }).end("Not found");
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    const revalidate = [".html", ".css", ".js"].includes(extension);
    response.writeHead(200, {
      "Cache-Control": revalidate ? "no-cache" : "public, max-age=3600",
      "Content-Length": stats.size,
      "Content-Type": contentTypes[extension] || "application/octet-stream",
    });
    if (request.method === "HEAD") response.end();
    else fs.createReadStream(filePath).pipe(response);
  });
}

function createServer() {
  return http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { Allow: "GET, HEAD" }).end("Method not allowed");
      return;
    }
    if (["/api/pricing", "/api/pricing.json"].includes(requestUrl.pathname)) {
      try {
        sendJson(response, 200, await fetchOfficialPricing());
      } catch (error) {
        const message = error.name === "AbortError" ? "连接官方定价页超时" : error.message;
        sendJson(response, 502, { error: message, fetchedAt: new Date().toISOString(), source: pricingSource });
      }
      return;
    }
    serveStatic(request, response, requestUrl.pathname);
  });
}

if (require.main === module) {
  createServer().listen(port, () => {
    console.log(`滑动变阻器已启动：http://localhost:${port}`);
  });
}

module.exports = { createServer, fetchOfficialPricing, parsePricingHtml };
