import {
    createProgram,
    createFullscreenQuad,
    createFBO,
    resizeFBO,
    uniformLoc,
} from '../webgl/glUtils.js';
import {
    FULLSCREEN_VERT,
    BLOOM_THRESHOLD_FRAG,
    BLOOM_BLUR_FRAG,
    BLOOM_COMPOSITE_FRAG,
    CHROMA_VIGNETTE_FRAG,
    GRADE_GRAIN_FRAG,
    BLIT_FRAG,
} from '../webgl/shaders.js';
/** @import { PostFxUniforms } from './PostFxUniforms.js' */

const BLOOM_THRESHOLD = 0.55;
const KAWASE_PASSES = 4;

/**
 * WebGL2 post-processing backend: threshold bloom, chroma/vignette, grade/grain.
 */
export class WebGL2PostFxBackend {
    /**
     * @param {WebGL2RenderingContext} gl
     */
    constructor(gl) {
        this.gl = gl;
        this._quad = createFullscreenQuad(gl);

        this._thresholdProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_THRESHOLD_FRAG);
        this._blurProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_BLUR_FRAG);
        this._compositeProg = createProgram(gl, FULLSCREEN_VERT, BLOOM_COMPOSITE_FRAG);
        this._chromaProg = createProgram(gl, FULLSCREEN_VERT, CHROMA_VIGNETTE_FRAG);
        this._gradeProg = createProgram(gl, FULLSCREEN_VERT, GRADE_GRAIN_FRAG);
        this._blitProg = createProgram(gl, FULLSCREEN_VERT, BLIT_FRAG);

        this._sceneTex = gl.createTexture();
        this._width = 0;
        this._height = 0;
        this._ping = null;
        this._pong = null;
        this._bloomA = null;
        this._bloomB = null;
    }

    /**
     * @param {number} width
     * @param {number} height
     */
    resize(width, height) {
        const gl = this.gl;
        if (width === this._width && height === this._height) return;
        this._width = width;
        this._height = height;

        const halfW = Math.max(1, Math.floor(width / 2));
        const halfH = Math.max(1, Math.floor(height / 2));

        if (!this._ping) {
            this._ping = createFBO(gl, width, height);
            this._pong = createFBO(gl, width, height);
            this._bloomA = createFBO(gl, halfW, halfH);
            this._bloomB = createFBO(gl, halfW, halfH);
        } else {
            resizeFBO(gl, this._ping, width, height);
            resizeFBO(gl, this._pong, width, height);
            resizeFBO(gl, this._bloomA, halfW, halfH);
            resizeFBO(gl, this._bloomB, halfW, halfH);
        }

        gl.bindTexture(gl.TEXTURE_2D, this._sceneTex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.bindTexture(gl.TEXTURE_2D, null);
    }

    /**
     * @param {PostFxUniforms} uniforms
     * @param {HTMLCanvasElement} sceneCanvas
     */
    render(uniforms, sceneCanvas) {
        const gl = this.gl;
        const [width, height] = uniforms.resolution;
        this.resize(width, height);

        gl.viewport(0, 0, width, height);
        gl.bindTexture(gl.TEXTURE_2D, this._sceneTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, sceneCanvas);

        this._runBloomPass(width, height, uniforms.bloomStrength);
        this._runChromaPass(uniforms);
        this._runGradePass(uniforms);

        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 1);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.bindVertexArray(this._quad.vao);
        gl.useProgram(this._blitProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._ping.texture);
        gl.uniform1i(uniformLoc(gl, this._blitProg, 'uTex'), 0);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        gl.bindVertexArray(null);
    }

    /**
     * @param {number} width
     * @param {number} height
     * @param {number} bloomStrength
     */
    _runBloomPass(width, height, bloomStrength) {
        const gl = this.gl;
        const halfW = Math.max(1, Math.floor(width / 2));
        const halfH = Math.max(1, Math.floor(height / 2));

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._bloomA.fbo);
        gl.viewport(0, 0, halfW, halfH);
        gl.useProgram(this._thresholdProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._sceneTex);
        gl.uniform1i(uniformLoc(gl, this._thresholdProg, 'uScene'), 0);
        gl.uniform1f(uniformLoc(gl, this._thresholdProg, 'uThreshold'), BLOOM_THRESHOLD);
        gl.bindVertexArray(this._quad.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

        let read = this._bloomA;
        let write = this._bloomB;
        gl.useProgram(this._blurProg);
        const blurTex = uniformLoc(gl, this._blurProg, 'uTex');
        const blurTexel = uniformLoc(gl, this._blurProg, 'uTexelSize');
        const blurOffset = uniformLoc(gl, this._blurProg, 'uOffset');

        for (let i = 0; i < KAWASE_PASSES; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, write.fbo);
            gl.viewport(0, 0, halfW, halfH);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, read.texture);
            gl.uniform1i(blurTex, 0);
            gl.uniform2f(blurTexel, 1 / halfW, 1 / halfH);
            gl.uniform2f(blurOffset, 1.0 + i, 1.0 + i);
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            const tmp = read;
            read = write;
            write = tmp;
        }

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._ping.fbo);
        gl.viewport(0, 0, width, height);
        gl.useProgram(this._compositeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._sceneTex);
        gl.uniform1i(uniformLoc(gl, this._compositeProg, 'uScene'), 0);
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, read.texture);
        gl.uniform1i(uniformLoc(gl, this._compositeProg, 'uBloom'), 1);
        gl.uniform1f(uniformLoc(gl, this._compositeProg, 'uBloomStrength'), bloomStrength * 0.55);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /** @param {PostFxUniforms} uniforms */
    _runChromaPass(uniforms) {
        const gl = this.gl;
        const [width, height] = uniforms.resolution;

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._pong.fbo);
        gl.viewport(0, 0, width, height);
        gl.useProgram(this._chromaProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._ping.texture);
        gl.uniform1i(uniformLoc(gl, this._chromaProg, 'uTex'), 0);
        gl.uniform2f(uniformLoc(gl, this._chromaProg, 'uResolution'), width, height);
        gl.uniform1f(uniformLoc(gl, this._chromaProg, 'uChromaOffset'), uniforms.chromaOffset);
        gl.uniform1f(uniformLoc(gl, this._chromaProg, 'uCriticalIntensity'), uniforms.criticalIntensity);
        gl.uniform1f(uniformLoc(gl, this._chromaProg, 'uTime'), uniforms.time);
        gl.bindVertexArray(this._quad.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    /** @param {PostFxUniforms} uniforms */
    _runGradePass(uniforms) {
        const gl = this.gl;
        const [width, height] = uniforms.resolution;
        const flash = uniforms.impactFlashColor || { r: 255, g: 255, b: 255 };

        gl.bindFramebuffer(gl.FRAMEBUFFER, this._ping.fbo);
        gl.viewport(0, 0, width, height);
        gl.useProgram(this._gradeProg);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this._pong.texture);
        gl.uniform1i(uniformLoc(gl, this._gradeProg, 'uTex'), 0);
        gl.uniform2f(uniformLoc(gl, this._gradeProg, 'uResolution'), width, height);
        gl.uniform1f(uniformLoc(gl, this._gradeProg, 'uTime'), uniforms.time);
        gl.uniform1f(uniformLoc(gl, this._gradeProg, 'uCriticalIntensity'), uniforms.criticalIntensity);
        gl.uniform1f(uniformLoc(gl, this._gradeProg, 'uComboT'), uniforms.comboT);
        gl.uniform1f(uniformLoc(gl, this._gradeProg, 'uComboPulse'), uniforms.comboPulse);
        gl.uniform1f(uniformLoc(gl, this._gradeProg, 'uGrainAmount'), uniforms.grainAmount);
        gl.uniform1f(uniformLoc(gl, this._gradeProg, 'uGrainHighQuality'), uniforms.grainHighQuality ? 1 : 0);
        gl.uniform1f(uniformLoc(gl, this._gradeProg, 'uBloomSynergy'), uniforms.bloomSynergy);
        gl.uniform3f(
            uniformLoc(gl, this._gradeProg, 'uImpactFlashColor'),
            flash.r / 255, flash.g / 255, flash.b / 255
        );
        gl.bindVertexArray(this._quad.vao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    dispose() {
        const gl = this.gl;
        gl.deleteTexture(this._sceneTex);
        for (const fbo of [this._ping, this._pong, this._bloomA, this._bloomB]) {
            if (fbo) {
                gl.deleteFramebuffer(fbo.fbo);
                gl.deleteTexture(fbo.texture);
            }
        }
        gl.deleteBuffer(this._quad.buffer);
        gl.deleteVertexArray(this._quad.vao);
    }
}
