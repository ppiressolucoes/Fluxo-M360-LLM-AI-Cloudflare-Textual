import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createImagePromptWorkflow } from '../src/image-prompt-workflow.mjs';
const path = new URL('../workflows/llm-core-cloudflare-prompt-imagem.json', import.meta.url);
const expected = `${JSON.stringify(createImagePromptWorkflow(), null, 2)}\n`;
if (process.argv.includes('--check')) {
  assert.equal(await readFile(path, 'utf8'), expected, 'Workflow de prompt desatualizado.');
  console.log('Workflow de prompt sincronizado.');
} else {
  await writeFile(path, expected);
  console.log('Workflow de prompt gerado.');
}
