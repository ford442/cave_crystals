import { execFileSync } from 'node:child_process';
import path from 'node:path';

// Vite dev-server plugin: rebuild release WASM when AssemblyScript sources change.
// ASC has no native watch mode; only the release target is rebuilt (see wasmBridge.js).

/**
 * @param {string} rootDir Project root (directory containing package.json).
 */
export function assemblyscriptWatchPlugin(rootDir) {
    const assemblyDir = path.resolve(rootDir, 'src/assembly');
    const releaseGlue = path.resolve(rootDir, 'build/release.js');

    const compileRelease = () => {
        execFileSync('npm', ['run', 'asbuild:release', '--silent'], {
            cwd: rootDir,
            stdio: 'inherit',
        });
    };

    const isAssemblySource = (file) => {
        const rel = path.relative(assemblyDir, path.resolve(file));
        return rel && !rel.startsWith('..') && !path.isAbsolute(rel) && rel.endsWith('.ts');
    };

    return {
        name: 'assemblyscript-watch',
        apply: 'serve',
        buildStart() {
            compileRelease();
        },
        configureServer(server) {
            server.watcher.add(assemblyDir);

            let building = false;
            let pending = false;

            const rebuild = () => {
                if (building) {
                    pending = true;
                    return;
                }
                building = true;
                try {
                    compileRelease();
                    const mod = server.moduleGraph.getModuleById(releaseGlue);
                    if (mod) {
                        server.moduleGraph.invalidateModule(mod);
                    }
                    server.ws.send({ type: 'full-reload' });
                } catch {
                    console.error('[assemblyscript-watch] WASM rebuild failed');
                } finally {
                    building = false;
                    if (pending) {
                        pending = false;
                        rebuild();
                    }
                }
            };

            const onAssemblyChange = (file) => {
                if (isAssemblySource(file)) {
                    rebuild();
                }
            };

            server.watcher.on('change', onAssemblyChange);
            server.watcher.on('add', onAssemblyChange);
            server.watcher.on('unlink', onAssemblyChange);
        },
    };
}
