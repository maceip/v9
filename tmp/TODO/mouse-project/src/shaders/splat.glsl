precision highp float;
varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec2 point;
uniform vec2 prevPoint;
uniform float radius;
uniform float canRender;

// cubicOut easing
float cubicOut(float t) {
    float f = t - 1.0;
    return f * f * f + 1.0;
}

// Capsule SDF: distance from uv to line segment (point1, point2)
float capsuleDist(vec2 uv, vec2 point1, vec2 point2) {
    vec2 pa = uv - point1;
    vec2 ba = point2 - point1;
    pa.x *= aspectRatio;
    ba.x *= aspectRatio;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

void main() {
    float d = capsuleDist(vUv, prevPoint, point);
    vec3 splat = (1.0 - cubicOut(clamp(d / radius, 0.0, 1.0))) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    base *= canRender;
    vec3 outColor = base + splat;
    gl_FragColor = vec4(outColor, 1.0);
}
