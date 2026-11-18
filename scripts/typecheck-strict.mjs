#!/usr/bin/env node
/**
 * Strict-mode ratchet. `npm run typecheck` runs this after the plain `tsc --noEmit` pass.
 *
 * tsc cannot scope `strict` to individual files, so this type-checks the whole program with
 * tsconfig.strict.json (`strict: true`) and judges each file under src/ separately:
 *
 *  - a file not listed in `legacyStrictErrors` must have zero strict errors;
 *  - a listed file may not exceed its recorded ceiling (new code must be typed);
 *  - a listed file below its ceiling must lower it, so fixed errors cannot creep back;
 *  - a listed file that no longer exists must be removed from the list.
 *
 * Output uses tsc's own diagnostic format, so editors and CI annotators can parse it.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configPath = path.join(root, 'tsconfig.strict.json');

/** @param {string} file */
const rel = (file) => path.relative(root, file).split(path.sep).join('/');

/** @param {readonly ts.Diagnostic[]} diagnostics */
function format(diagnostics) {
    return ts.formatDiagnostics(diagnostics, {
        getCurrentDirectory: () => root,
        getCanonicalFileName: (name) => name,
        getNewLine: () => '\n',
    });
}

/** @param {string} message */
function die(message) {
    console.error(message);
    process.exit(1);
}

const read = ts.readConfigFile(configPath, ts.sys.readFile);
if (read.error) die(format([read.error]));

/** @type {Record<string, number>} */
const baseline = read.config.legacyStrictErrors ?? {};
const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, root, undefined, configPath);
if (parsed.errors.length) die(format(parsed.errors));

const program = ts.createProgram({ rootNames: parsed.fileNames, options: parsed.options });
const configDiagnostics = [...program.getOptionsDiagnostics(), ...program.getGlobalDiagnostics()];
if (configDiagnostics.length) die(format(configDiagnostics));

/** @type {Map<string, readonly ts.Diagnostic[]>} */
const byFile = new Map();
for (const sourceFile of program.getSourceFiles()) {
    const file = rel(sourceFile.fileName);
    if (!file.startsWith('src/') || program.isSourceFileFromExternalLibrary(sourceFile)) continue;
    byFile.set(file, ts.getPreEmitDiagnostics(program, sourceFile));
}

const failures = [];
const output = [];
let legacyFiles = 0;
let knownErrors = 0;

for (const [file, diagnostics] of byFile) {
    const ceiling = baseline[file];
    const count = diagnostics.length;
    if (ceiling === undefined) {
        if (count > 0) {
            failures.push(`${file}: ${count} strict-mode error(s) in a file that must be strict-clean.`);
            output.push(format(diagnostics));
        }
        continue;
    }
    legacyFiles += 1;
    knownErrors += count;
    if (count > ceiling) {
        failures.push(`${file}: ${count} strict-mode errors, ceiling is ${ceiling}. New code in a legacy file must be fully typed (every strict error in the file is listed above; look for the ones near your change).`);
        output.push(format(diagnostics));
    } else if (count < ceiling) {
        failures.push(
            `${file}: improved from ${ceiling} to ${count} strict-mode errors. ` +
            `Set it to ${count} in tsconfig.strict.json${count === 0 ? ' (or delete the entry)' : ''} to lock the gain in.`,
        );
    }
}

for (const file of Object.keys(baseline)) {
    if (!byFile.has(file)) {
        failures.push(`${file}: listed in tsconfig.strict.json but not part of the program. Remove the entry.`);
    }
}

if (failures.length) {
    console.error(output.join(''));
    console.error(`Strict typecheck failed:\n${failures.map((f) => `  - ${f}`).join('\n')}`);
    console.error('\nSee tsconfig.strict.json for how the ceilings work.');
    process.exit(1);
}

console.log(
    `strict typecheck OK: ${byFile.size - legacyFiles} files strict-clean, ` +
    `${legacyFiles} legacy files within their ceilings (${knownErrors} known errors).`,
);
