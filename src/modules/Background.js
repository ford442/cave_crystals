export class Background {
    constructor() {
        this.canvas = document.createElement('canvas');
        this.canvas.id = 'bgCanvas';
        this.gl = this.canvas.getContext('webgl');

        // Append to container, behind game canvas
        const container = document.getElementById('gameContainer');
        container.insertBefore(this.canvas, container.firstChild);

        this.resize();
        window.addEventListener('resize', () => this.resize());

        if (!this.gl) {
            console.warn('WebGL not supported for background');
            return;
        }

        this.initShaders();
        this.initBuffers();
        this.startTime = Date.now();

        requestAnimationFrame(this.render.bind(this));
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        if(this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    initShaders() {
        const vsSource = `
            attribute vec4 aVertexPosition;
            void main() {
                gl_Position = aVertexPosition;
            }
        `;

        const fsSource = `
            precision mediump float;
            uniform vec2 uResolution;
            uniform float uTime;

            // Simple noise function
            float noise(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            void main() {
                vec2 st = gl_FragCoord.xy / uResolution.xy;
                st.x *= uResolution.x / uResolution.y;

                vec3 color = vec3(0.0);

                // Deep cave background gradient
                vec3 topColor = vec3(0.05, 0.0, 0.1);
                vec3 botColor = vec3(0.0, 0.05, 0.15);
                color = mix(botColor, topColor, st.y);

                // Subtle moving mist/fog
                float t = uTime * 0.1;
                float mist = noise(st * 3.0 + t) * 0.1;
                color += vec3(mist * 0.2, mist * 0.1, mist * 0.3);

                // Distant faint crystals
                float stars = noise(st * 20.0);
                if (stars > 0.985) {
                    float twinkle = sin(uTime * 5.0 + stars * 100.0) * 0.5 + 0.5;
                    color += vec3(twinkle * 0.5);
                }

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        const vertexShader = this.loadShader(this.gl.VERTEX_SHADER, vsSource);
        const fragmentShader = this.loadShader(this.gl.FRAGMENT_SHADER, fsSource);

        this.program = this.gl.createProgram();
        this.gl.attachShader(this.program, vertexShader);
        this.gl.attachShader(this.program, fragmentShader);
        this.gl.linkProgram(this.program);

        if (!this.gl.getProgramParameter(this.program, this.gl.LINK_STATUS)) {
            console.error('Unable to initialize the shader program: ' + this.gl.getProgramInfoLog(this.program));
        }

        this.programInfo = {
            program: this.program,
            attribLocations: {
                vertexPosition: this.gl.getAttribLocation(this.program, 'aVertexPosition'),
            },
            uniformLocations: {
                resolution: this.gl.getUniformLocation(this.program, 'uResolution'),
                time: this.gl.getUniformLocation(this.program, 'uTime'),
            },
        };
    }

    loadShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);

        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error('An error occurred compiling the shaders: ' + this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    initBuffers() {
        this.positionBuffer = this.gl.createBuffer();
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        const positions = [
            -1.0,  1.0,
             1.0,  1.0,
            -1.0, -1.0,
             1.0, -1.0,
        ];
        this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array(positions), this.gl.STATIC_DRAW);
    }

    render() {
        if (!this.gl) return;

        const currentTime = (Date.now() - this.startTime) * 0.001;

        this.gl.clearColor(0.0, 0.0, 0.0, 1.0);
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.gl.useProgram(this.programInfo.program);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(
            this.programInfo.attribLocations.vertexPosition,
            2,
            this.gl.FLOAT,
            false,
            0,
            0
        );
        this.gl.enableVertexAttribArray(this.programInfo.attribLocations.vertexPosition);

        this.gl.uniform2f(this.programInfo.uniformLocations.resolution, this.canvas.width, this.canvas.height);
        this.gl.uniform1f(this.programInfo.uniformLocations.time, currentTime);

        this.gl.drawArrays(this.gl.TRIANGLE_STRIP, 0, 4);

        requestAnimationFrame(this.render.bind(this));
    }
}
