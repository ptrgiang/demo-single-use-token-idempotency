import { readFileSync } from 'node:fs';
import { Script } from 'node:vm';
for (const file of ['index.html', 'mini.html']) {
  const source = readFileSync(new URL('../' + file, import.meta.url), 'utf8');
  for (const [i, match] of [...source.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].entries()) {
    new Script(match[1], { filename: `${file}:script-${i}` });
  }
}
console.log('Client scripts: syntax passed');
