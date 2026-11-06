import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createWorkflow } from "../src/workflow.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(
  root,
  "workflows/fluxo-m360-llm-ai-cloudflare-textual.json",
);
const expected = `${JSON.stringify(createWorkflow(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8");
  assert.equal(
    current,
    expected,
    "O workflow exportado está desatualizado; execute npm run workflow:generate.",
  );
  console.log("Workflow exportado está sincronizado com a definição.");
} else {
  await writeFile(destination, expected, "utf8");
  console.log(`Workflow gerado em ${destination}`);
}
