precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D u_output_texture;
    uniform sampler2D u_text_texture;

    void main () {
        vec3 C = texture2D(u_output_texture, vUv).rgb;
        float text = texture2D(u_text_texture, vec2(vUv.x, 1. - vUv.y)).r; 
        gl_FragColor = vec4(vec3(1.) - C, 1.);
    }
