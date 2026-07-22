import { execFileSync } from 'node:child_process';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function lintFixture(fixtureName) {
    const fixturePath = path.join('test/lint/fixtures', fixtureName);
    try {
        execFileSync(
            process.platform === 'win32' ? 'npx.cmd' : 'npx',
            ['eslint', '-c', 'test/lint/fixtures.eslint.config.js', fixturePath],
            {
                cwd: root,
                encoding: 'utf8',
                stdio: ['ignore', 'pipe', 'pipe'],
            },
        );
        return { ok: true, output: '' };
    } catch (error) {
        const output = `${error.stdout || ''}${error.stderr || ''}`;
        return { ok: false, output };
    }
}

test('flags missing imports / undefined symbols (EnergyRing regression)', () => {
    const result = lintFixture('missing-import.js');
    assert.equal(result.ok, false, 'expected lint failure');
    assert.match(result.output, /no-undef|EnergyRing/);
});

test('flags temporal dead zone usage (animHeightScale regression)', () => {
    const result = lintFixture('tdz-order.js');
    assert.equal(result.ok, false, 'expected lint failure');
    assert.match(result.output, /no-use-before-define|animHeightScale/);
});

test('src tree passes eslint', () => {
    execFileSync(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'lint'],
        { cwd: root, stdio: 'inherit' },
    );
});

test('src tree passes typecheck', () => {
    execFileSync(
        process.platform === 'win32' ? 'npm.cmd' : 'npm',
        ['run', 'typecheck'],
        { cwd: root, stdio: 'inherit' },
    );
});
