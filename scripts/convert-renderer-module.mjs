#!/usr/bin/env node
/**
 * Converts Renderer.prototype installer modules into composed renderer classes.
 * Usage: node scripts/convert-renderer-module.mjs <input.js> <ClassName> <output.js> [replacements.json]
 */
import fs from 'fs';

const [inputPath, className, outputPath, replacementsPath] = process.argv.slice(2);
if (!inputPath || !className || !outputPath) {
    console.error('Usage: node convert-renderer-module.mjs <input> <ClassName> <output> [replacements.json]');
    process.exit(1);
}

let content = fs.readFileSync(inputPath, 'utf8');
content = content.replace(/^\/\/ @ts-nocheck\n/, '');

const importMatch = content.match(/^import[\s\S]*?from '[^']+';\n/m);
const imports = importMatch ? importMatch[0] : '';

const bodyMatch = content.match(/Object\.assign\(Renderer\.prototype, \{([\s\S]*)\}\);\s*\}/);
if (!bodyMatch) {
    console.error('Could not find Object.assign(Renderer.prototype, ...) in', inputPath);
    process.exit(1);
}

let body = bodyMatch[1];

const HOST_PROPS = [
    'ctx', 'canvas', 'width', 'height', 'laneWidth', 'scanlinePattern',
    '_gradientCache', '_glitchRects', '_glitchIntensity', '_vignetteGradient',
    '_baseVignetteGradient', '_fogGradient', '_fogSweepGrad', '_qualityProfiles',
    '_grainCanvas', '_grainCtx', '_grainPattern', '_lastGrainRefresh',
    '_bloomCanvas', '_bloomCtx', '_bloomGradCache', '_shaftGradCache', '_shaftGradCacheH',
    '_shaftDustMotes', '_caveGeometry', '_caveGeometryW', '_caveGeometryH',
    '_distortionField', '_distortionLookupCount', '_distortionFieldTrackLookups',
    '_darkenColorCache', '_colorGradeBaseGrad', '_colorGradeBaseGradH',
    '_colorGradeComboGrad', '_colorGradeComboGradW'
];

for (const prop of HOST_PROPS) {
    const escaped = prop.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    body = body.replace(new RegExp(`this\\.${escaped}\\b`, 'g'), `this.host.${prop}`);
}

body = body.replace(/\bthis\.getQualityProfile\b/g, 'this.host.getQualityProfile');

if (replacementsPath && fs.existsSync(replacementsPath)) {
    const replacements = JSON.parse(fs.readFileSync(replacementsPath, 'utf8'));
    for (const [from, to] of Object.entries(replacements)) {
        body = body.replace(new RegExp(from.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), to);
    }
}

// Object-literal method separators -> plain class methods
body = body.replace(/\n        ,\n/g, '\n\n');

const out = `${imports}/** @import { RendererHost } from './RendererHost.js' */

export class ${className} {
    /** @param {RendererHost} host */
    constructor(host) {
        this.host = host;
    }
${body}
}
`;

fs.writeFileSync(outputPath, out);
console.log('Wrote', outputPath);
