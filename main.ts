// main.ts — the entrypoint: hands the game in by copying game/ and screenshots/
// to the output directory and writing dossier.json with the kit's buildDossier.
// Node 22, standard library only, plus the vendored kit library. Runs twice
// byte-identical: the copy is sorted and the dossier is canonical JSON.

import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const REPO_ROOT = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const DOSSIER_CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function countTree(dir) {
  let files = 0;
  let bytes = 0;
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) {
      const sub = countTree(p);
      files += sub.files;
      bytes += sub.bytes;
    } else if (st.isFile()) {
      files += 1;
      bytes += st.size;
    }
  }
  return { files, bytes };
}

function main() {
  const gameSrc = join(REPO_ROOT, 'game');
  const shotsSrc = join(REPO_ROOT, 'screenshots');
  if (!existsSync(gameSrc)) throw new Error('main.ts: no game/ directory beside main.ts');
  if (!existsSync(shotsSrc)) throw new Error('main.ts: no screenshots/ directory beside main.ts');

  mkdirSync(join(OUT_DIR, 'game'), { recursive: true });
  mkdirSync(join(OUT_DIR, 'screenshots'), { recursive: true });
  cpSync(gameSrc, join(OUT_DIR, 'game'), { recursive: true });
  cpSync(shotsSrc, join(OUT_DIR, 'screenshots'), { recursive: true });

  const dossier = buildDossier(OUT_DIR, DOSSIER_CAPS);
  writeFileSync(join(OUT_DIR, 'dossier.json'), dossier);
  // Verify the dossier round-trips: a corrupt write must fail loudly here,
  // not at submission time.
  const parsed = JSON.parse(readFileSync(join(OUT_DIR, 'dossier.json'), 'utf8'));
  if (!parsed || typeof parsed !== 'object') throw new Error('main.ts: dossier.json did not parse');

  const gameStats = countTree(join(OUT_DIR, 'game'));
  const shotStats = countTree(join(OUT_DIR, 'screenshots'));
  console.log(`main.ts: wrote ${OUT_DIR}`);
  console.log(`  game/: ${gameStats.files} files, ${gameStats.bytes} bytes`);
  console.log(`  screenshots/: ${shotStats.files} files, ${shotStats.bytes} bytes`);
  console.log(`  dossier.json: ${dossier.length} bytes`);
}

main();
