precision highp float;
    precision highp sampler2D;

    varying highp vec2 vUv;
    varying highp vec2 vL;
    varying highp vec2 vR;
    varying highp vec2 vT;
    varying highp vec2 vB;
    uniform sampler2D u_pressure_texture;
    uniform sampler2D u_divergence_texture;
    uniform sampler2D u_text_texture;

    void main () {

        float text = texture2D(u_text_texture, vec2(vUv.x, 1. - vUv.y)).r;

        float L = texture2D(u_pressure_texture, vL).x;
        float R = texture2D(u_pressure_texture, vR).x;
        float T = texture2D(u_pressure_texture, vT).x;
        float B = texture2D(u_pressure_texture, vB).x;
        float C = texture2D(u_pressure_texture, vUv).x;
        float divergence = texture2D(u_divergence_texture, vUv).x;

        float pressure = (L + R + B + T - divergence) * 0.25;
        pressure += (.2 * text);

        gl_FragColor = vec4(pressure, 0., 0., 1.);
    }
