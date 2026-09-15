precision highp float;
    precision highp sampler2D;

    varying vec2 vUv;
    uniform sampler2D u_input_texture;
    uniform float u_ratio;
    uniform vec3 u_point_value;
    uniform vec2 u_point;
    uniform float u_point_size;

    uniform sampler2D u_text_texture;


    void main () {
        vec2 p = vUv - u_point.xy;
        p.x *= u_ratio;
        vec3 splat = pow(2., -dot(p, p) / u_point_size) * u_point_value;

        float text = texture2D(u_text_texture, vec2(vUv.x, 1. - vUv.y)).r;
        splat *= (.7 + .2 * text);

        vec3 base = texture2D(u_input_texture, vUv).xyz;
        gl_FragColor = vec4(base + splat, 1.);
    }
