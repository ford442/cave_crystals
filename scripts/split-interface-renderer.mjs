#!/usr/bin/env node
import fs from 'fs';

const content = fs.readFileSync('src/modules/RendererInterfaceEffects.js', 'utf8');
const bodyMatch = content.match(/Object\.assign\(Renderer\.prototype, \{([\s\S]*)\}\);/);
if (!bodyMatch) throw new Error('no body');
const body = bodyMatch[1];

const imports = content.replace(/^\/\/ @ts-nocheck\n/, '').split('export function')[0];

const hudMethods = ['drawHoloGrid', 'drawTargetingSystem', 'drawCursor', 'drawSpore', 'drawDevMetricsOverlay'];
const particleMethods = [
    'drawShockwave', 'drawEnergyRing', 'drawParticle', '_drawAuraParticle', '_drawEmberParticle',
    '_drawTrailParticle', '_drawSparkParticle', '_drawShardParticle', '_drawDebrisParticle',
    '_drawChunkParticle', '_drawPhysicalParticle', 'drawParticlesBatched', 'drawTrailParticle',
    'drawSoulParticle', 'drawFloatingText'
];

function extractMethods(methodNames) {
    const chunks = [];
    for (const name of methodNames) {
        const start = body.indexOf(`        ${name}(`);
        if (start < 0) throw new Error(`Method not found: ${name}`);
        let depth = 0;
        let started = false;
        let end = start;
        for (let i = start; i < body.length; i++) {
            const ch = body[i];
            if (ch === '{') { depth++; started = true; }
            if (ch === '}') {
                depth--;
                if (started && depth === 0) {
                    end = i + 1;
                    break;
                }
            }
        }
        chunks.push(body.slice(start, end).replace(/\n        ,\s*$/, ''));
    }
    return chunks.join('\n\n');
}

const HOST_PROPS = [
    'ctx', 'canvas', 'width', 'height', 'laneWidth', 'scanlinePattern',
    '_gradientCache', '_distortionField', '_distortionLookupCount'
];

function transform(bodyText, extraReplacements = {}) {
    let out = bodyText;
    for (const prop of HOST_PROPS) {
        out = out.replace(new RegExp(`this\\.${prop}\\b`, 'g'), `this.host.${prop}`);
    }
    out = out.replace(/\bthis\.getQualityProfile\b/g, 'this.host.getQualityProfile');
    for (const [from, to] of Object.entries(extraReplacements)) {
        out = out.replace(new RegExp(from, 'g'), to);
    }
    out = out.replace(/\n        ,\n/g, '\n\n');
    return out.replace(/^        /gm, '    ');
}

function writeClass(className, methodsBody, extraReplacements) {
    const methods = transform(methodsBody, extraReplacements);
    const file = `/** @import { RendererHost } from './RendererHost.js' */

${imports.trim()}

export class ${className} {
    /** @param {RendererHost} host */
    constructor(host) {
        this.host = host;
    }

${methods}
}
`;
    fs.writeFileSync(`src/modules/renderers/${className}.js`, file);
    console.log('Wrote', className);
}

writeClass('HudEffectsRenderer', extractMethods(hudMethods), {
    'this\\.getGridShockwaveDistortion': 'this.host.crystal.getGridShockwaveDistortion'
});
writeClass('ParticleRenderer', extractMethods(particleMethods));
