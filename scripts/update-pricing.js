const fs = require("node:fs/promises");
const path = require("node:path");
const { fetchOfficialPricing } = require("../server");

async function updatePricing() {
  const payload = await fetchOfficialPricing();
  const outputDirectory = path.resolve(__dirname, "../api");
  const outputPath = path.join(outputDirectory, "pricing.json");
  const temporaryPath = path.join(outputDirectory, "pricing.json.tmp");

  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(temporaryPath, `${JSON.stringify(payload)}\n`, "utf8");
  await fs.rename(temporaryPath, outputPath);

  const flash = payload.models["deepseek-v4-flash"];
  const pro = payload.models["deepseek-v4-pro"];
  console.log(`价格已生成：Flash ${flash.input}/${flash.output}，Pro ${pro.input}/${pro.output}`);
}

updatePricing().catch((error) => {
  console.error(`价格生成失败：${error.message}`);
  process.exitCode = 1;
});
