import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { createGroqWorkflow } from "../src/groq-workflow.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const destination = resolve(root, "workflows/llm-core-ai-cross-account-textual-piloto-groq.json");
const expected = `${JSON.stringify(createGroqWorkflow(), null, 2)}\n`;

if (process.argv.includes("--check")) {
  const current = await readFile(destination, "utf8");
  assert.equal(current, expected, "O workflow Groq está desatualizado; execute npm run groq-workflow:generate.");
  console.log("Workflow Groq está sincronizado com a definição.");
} else {
  await writeFile(destination, expected, "utf8");
  console.log(`Workflow Groq gerado em ${destination}`);
}
