const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const assert = require("node:assert/strict");
const { parsePricingHtml } = require("./server");

test("extracts flash and pro prices from the official table shape", () => {
  const html = `
    <table>
      <tr><td colspan="2">模型</td><td>deepseek-v4-flash</td><td>deepseek-v4-pro</td></tr>
      <tr><td rowspan="3">价格</td><td>百万tokens输入（缓存命中）</td><td>0.02元</td><td>0.025元</td></tr>
      <tr><td>百万tokens输入（缓存未命中）</td><td>1元</td><td>3元</td></tr>
      <tr><td>百万tokens输出</td><td>2元</td><td>6元</td></tr>
    </table>`;

  assert.deepEqual(parsePricingHtml(html), {
    "deepseek-v4-flash": { cacheHitInput: 0.02, input: 1, output: 2 },
    "deepseek-v4-pro": { cacheHitInput: 0.025, input: 3, output: 6 },
  });
});

test("fails loudly instead of returning partial or stale-looking data", () => {
  const changedTable = "<table><tr><td>deepseek-v4-flash</td><td>deepseek-v4-pro</td></tr></table>";
  assert.throws(() => parsePricingHtml(changedTable), /结构已变化/);
});

test("follows model headers if the official table changes column order", () => {
  const html = `<table>
    <tr><td>模型</td><td>deepseek-v4-pro</td><td>deepseek-v4-flash</td></tr>
    <tr><td>输入（缓存命中）</td><td>0.025元</td><td>0.02元</td></tr>
    <tr><td>输入（缓存未命中）</td><td>3元</td><td>1元</td></tr>
    <tr><td>百万tokens输出</td><td>6元</td><td>2元</td></tr>
  </table>`;
  assert.deepEqual(parsePricingHtml(html)["deepseek-v4-flash"], { cacheHitInput: 0.02, input: 1, output: 2 });
});

test("parses a downloaded official page when supplied by the integration check", () => {
  const fixturePath = process.env.DEEPSEEK_PRICING_FIXTURE;
  if (!fixturePath) return;
  const html = fs.readFileSync(path.resolve(fixturePath), "utf8");
  const models = parsePricingHtml(html);
  assert.ok(Number.isFinite(models["deepseek-v4-flash"].input));
  assert.ok(Number.isFinite(models["deepseek-v4-pro"].output));
});
