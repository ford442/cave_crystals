export const FULLSCREEN_VERT = `#version 300 es
precision highp float;
layout(location = 0) in vec2 aPos;
layout(location = 1) in vec2 aUv;
out vec2 vUv;
void main() {
    vUv = aUv;
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

export const BLOOM_THRESHOLD_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform float uThreshold;
void main() {
    vec3 c = texture(uScene, vUv).rgb;
    vec3 bright = max(c - uThreshold, 0.0);
    fragColor = vec4(bright, 1.0);
}
`;

export const BLOOM_BLUR_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uTexelSize;
uniform vec2 uOffset;
void main() {
    vec2 o = uTexelSize * uOffset;
    vec3 sum = texture(uTex, vUv).rgb * 0.227027;
    sum += texture(uTex, vUv + o * vec2(1.0, 0.0)).rgb * 0.1945946;
    sum += texture(uTex, vUv - o * vec2(1.0, 0.0)).rgb * 0.1945946;
    sum += texture(uTex, vUv + o * vec2(0.0, 1.0)).rgb * 0.1216216;
    sum += texture(uTex, vUv - o * vec2(0.0, 1.0)).rgb * 0.1216216;
    sum += texture(uTex, vUv + o).rgb * 0.0702703;
    sum += texture(uTex, vUv - o).rgb * 0.0702703;
    fragColor = vec4(sum, 1.0);
}
`;

export const BLOOM_COMPOSITE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uBloomStrength;
void main() {
    vec3 scene = texture(uScene, vUv).rgb;
    vec3 bloom = texture(uBloom, vUv).rgb;
    fragColor = vec4(scene + bloom * uBloomStrength, 1.0);
}
`;

export const CHROMA_VIGNETTE_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uChromaOffset;
uniform float uCriticalIntensity;
uniform float uTime;
void main() {
    vec2 uv = vUv;
    vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
    vec2 centered = (uv - 0.5) * aspect;
    float dist = length(centered);
    float baseVig = smoothstep(0.35, 0.92, dist) * 0.58;
    float critPulse = 0.5 + 0.5 * sin(uTime * 5.0);
    float critVig = uCriticalIntensity * 0.6 * critPulse * smoothstep(0.2, 0.85, dist);
    float offset = uChromaOffset / uResolution.x;
    float r = texture(uTex, uv + vec2(offset, 0.0)).r;
    float g = texture(uTex, uv).g;
    float b = texture(uTex, uv - vec2(offset, 0.0)).b;
    vec3 color = vec3(r, g, b);
    color *= 1.0 - baseVig;
    color = mix(color, vec3(1.0, 0.0, 0.0), critVig * 0.55);
    fragColor = vec4(color, 1.0);
}
`;

export const GRADE_GRAIN_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
uniform vec2 uResolution;
uniform float uTime;
uniform float uCriticalIntensity;
uniform float uComboT;
uniform float uComboPulse;
uniform float uGrainAmount;
uniform float uGrainHighQuality;
uniform float uBloomSynergy;
uniform vec3 uImpactFlashColor;
void main() {
    vec3 color = texture(uTex, vUv).rgb;
    float y = vUv.y;
    vec3 gradeTop = vec3(150.0, 190.0, 255.0) / 255.0;
    vec3 gradeBot = vec3(70.0, 110.0, 200.0) / 255.0;
    vec3 grade = mix(gradeBot, gradeTop, y);
    color = mix(color, color * grade, 0.045 + uComboT * 0.012);
    if (uCriticalIntensity > 0.0) {
        color = mix(color, color * vec3(1.0, 0.22, 0.0), uCriticalIntensity * 0.12);
        color += vec3(0.31, 0.04, 0.0) * uCriticalIntensity * 0.05;
        if (uCriticalIntensity > 0.25) {
            float bleed = 0.7 + 0.3 * sin(uTime * 3.2);
            color = mix(color, color * vec3(1.0, 0.35, 0.12), (uCriticalIntensity - 0.25) * 0.08 * bleed);
        }
    }
    if (uComboT > 0.0) {
        float shimmer = 0.5 + 0.5 * sin(uTime * 3.5);
        vec3 combo = mix(vec3(1.0, 0.51, 0.12), vec3(1.0, 0.82, 0.24), vUv.x);
        color += combo * uComboT * 0.068 * shimmer;
        color += vec3(1.0, 0.94, 0.71) * uComboT * 0.022 * (0.5 + 0.5 * sin(uTime * 5.5));
    }
    if (uBloomSynergy > 0.0) {
        color += uImpactFlashColor * uBloomSynergy * 0.12;
    }
    if (uComboPulse > 0.1) {
        color += vec3(1.0, 0.78, 0.47) * uComboPulse * 0.035;
    }
    if (uGrainAmount > 0.0) {
        vec2 grainUv = vUv * uResolution * 0.5;
        float n = fract(sin(dot(floor(grainUv) + uTime * 60.0, vec2(12.9898, 78.233))) * 43758.5453);
        float grain = (n - 0.5) * 0.14 * uGrainAmount;
        if (uGrainHighQuality > 0.5) grain *= 1.08;
        color += grain;
    }
    fragColor = vec4(color, 1.0);
}
`;

export const BLIT_FRAG = `#version 300 es
precision highp float;
in vec2 vUv;
out vec4 fragColor;
uniform sampler2D uTex;
void main() {
    fragColor = texture(uTex, vUv);
}
`;
