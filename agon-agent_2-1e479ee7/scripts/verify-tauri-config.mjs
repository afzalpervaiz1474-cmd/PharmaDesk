#!/usr/bin/env node
/**
 * Static checks for the Tauri shell that do not need a Rust toolchain.
 *
 *   1. tauri.conf.json is valid against the config schema shipped with the
 *      installed @tauri-apps/cli.
 *   2. Every bundle icon listed in the config exists.
 *   3. Every migration referenced from src-tauri/src/lib.rs exists, versions
 *      are unique and increasing, and no migration file is left unreferenced.
 *   4. The database URL is identical in Rust, the Tauri config and TypeScript.
 *   5. Capability files are valid JSON and target a window that exists.
 *
 * This does NOT compile the Rust code. Run `npm run tauri build` (or
 * `cargo check` inside src-tauri) for that.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tauriDir = join(root, 'src-tauri');
const problems = [];
const passed = [];

const check = (label, ok, detail = '') => {
  if (ok) passed.push(label);
  else problems.push(detail ? `${label}: ${detail}` : label);
};

// 1. Schema validation ------------------------------------------------------
const config = JSON.parse(readFileSync(join(tauriDir, 'tauri.conf.json'), 'utf8'));
const schema = require('@tauri-apps/cli/config.schema.json');
const cliVersion = require('@tauri-apps/cli/package.json').version;
const Ajv = require('ajv');
const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false, unicodeRegExp: false });
const validate = ajv.compile(schema);
const valid = validate(config);
check(
  `tauri.conf.json matches the config schema of @tauri-apps/cli ${cliVersion}`,
  valid,
  valid ? '' : ajv.errorsText(validate.errors, { separator: '; ' }),
);

// 2. Icons ------------------------------------------------------------------
const icons = config.bundle?.icon ?? [];
const missingIcons = icons.filter((icon) => !existsSync(join(tauriDir, icon)));
check(`all ${icons.length} bundle icons exist`, icons.length > 0 && missingIcons.length === 0, missingIcons.join(', '));

// 3. Migrations -------------------------------------------------------------
const libRs = readFileSync(join(tauriDir, 'src', 'lib.rs'), 'utf8');
const referenced = [...libRs.matchAll(/include_str!\("\.\.\/migrations\/([^"]+)"\)/g)].map((match) => match[1]);
const versions = [...libRs.matchAll(/version:\s*(\d+)/g)].map((match) => Number(match[1]));
const onDisk = readdirSync(join(tauriDir, 'migrations')).filter((file) => file.endsWith('.sql')).sort();
const missingMigrations = referenced.filter((file) => !onDisk.includes(file));
const unreferenced = onDisk.filter((file) => !referenced.includes(file));
check('every migration referenced in lib.rs exists', missingMigrations.length === 0, missingMigrations.join(', '));
check('every migration file is registered in lib.rs', unreferenced.length === 0, unreferenced.join(', '));
check(
  'migration versions are unique and increasing',
  versions.length === referenced.length && versions.every((version, index) => index === 0 || version > versions[index - 1]),
  versions.join(', '),
);

// 4. Database URL consistency -------------------------------------------------
const rustUrl = /const DATABASE_URL: &str = "([^"]+)"/.exec(libRs)?.[1];
const tsUrl = /SQLITE_URL = '([^']+)'/.exec(readFileSync(join(root, 'src', 'data', 'runtime.ts'), 'utf8'))?.[1];
const preload = config.plugins?.sql?.preload ?? [];
check(
  'database URL is the same in lib.rs, tauri.conf.json and src/data/runtime.ts',
  Boolean(rustUrl) && rustUrl === tsUrl && preload.includes(rustUrl),
  `lib.rs=${rustUrl} runtime.ts=${tsUrl} preload=${JSON.stringify(preload)}`,
);

// 5. Capabilities -----------------------------------------------------------
const windowLabels = (config.app?.windows ?? []).map((window) => window.label ?? 'main');
for (const file of readdirSync(join(tauriDir, 'capabilities')).filter((name) => name.endsWith('.json'))) {
  try {
    const capability = JSON.parse(readFileSync(join(tauriDir, 'capabilities', file), 'utf8'));
    const unknown = (capability.windows ?? []).filter((label) => !windowLabels.includes(label));
    check(`capabilities/${file} targets existing windows`, unknown.length === 0, unknown.join(', '));
    check(
      `capabilities/${file} grants SQL read and write permissions`,
      ['sql:default', 'sql:allow-execute'].every((permission) => capability.permissions?.includes(permission)),
    );
  } catch (error) {
    check(`capabilities/${file} is valid JSON`, false, String(error));
  }
}

for (const label of passed) console.log(`  ok    ${label}`);
for (const label of problems) console.error(`  FAIL  ${label}`);
console.log('\nNote: these are static checks only. The Rust shell is not compiled by this script.');
process.exit(problems.length === 0 ? 0 : 1);
