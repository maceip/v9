{@}AntimatterCopy.fs{@}uniform sampler2D tDiffuse;

varying vec2 vUv;

void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
}{@}AntimatterCopy.vs{@}varying vec2 vUv;
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}{@}AntimatterPass.vs{@}varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}{@}AntimatterPosition.vs{@}uniform sampler2D tPos;
uniform float uDPR;

void main() {
    vec4 decodedPos = texture2D(tPos, position.xy);
    vec3 pos = decodedPos.xyz;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (0.02 * uDPR) * (1000.0 / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;
}{@}AntimatterBasicFrag.fs{@}void main() {
    gl_FragColor = vec4(1.0);
}{@}antimatter.glsl{@}vec3 getData(sampler2D tex, vec2 uv) {
    return texture2D(tex, uv).xyz;
}

vec4 getData4(sampler2D tex, vec2 uv) {
    return texture2D(tex, uv);
}

{@}conditionals.glsl{@}vec4 when_eq(vec4 x, vec4 y) {
  return 1.0 - abs(sign(x - y));
}

vec4 when_neq(vec4 x, vec4 y) {
  return abs(sign(x - y));
}

vec4 when_gt(vec4 x, vec4 y) {
  return max(sign(x - y), 0.0);
}

vec4 when_lt(vec4 x, vec4 y) {
  return max(sign(y - x), 0.0);
}

vec4 when_ge(vec4 x, vec4 y) {
  return 1.0 - when_lt(x, y);
}

vec4 when_le(vec4 x, vec4 y) {
  return 1.0 - when_gt(x, y);
}

vec3 when_eq(vec3 x, vec3 y) {
  return 1.0 - abs(sign(x - y));
}

vec3 when_neq(vec3 x, vec3 y) {
  return abs(sign(x - y));
}

vec3 when_gt(vec3 x, vec3 y) {
  return max(sign(x - y), 0.0);
}

vec3 when_lt(vec3 x, vec3 y) {
  return max(sign(y - x), 0.0);
}

vec3 when_ge(vec3 x, vec3 y) {
  return 1.0 - when_lt(x, y);
}

vec3 when_le(vec3 x, vec3 y) {
  return 1.0 - when_gt(x, y);
}

vec2 when_eq(vec2 x, vec2 y) {
  return 1.0 - abs(sign(x - y));
}

vec2 when_neq(vec2 x, vec2 y) {
  return abs(sign(x - y));
}

vec2 when_gt(vec2 x, vec2 y) {
  return max(sign(x - y), 0.0);
}

vec2 when_lt(vec2 x, vec2 y) {
  return max(sign(y - x), 0.0);
}

vec2 when_ge(vec2 x, vec2 y) {
  return 1.0 - when_lt(x, y);
}

vec2 when_le(vec2 x, vec2 y) {
  return 1.0 - when_gt(x, y);
}

float when_eq(float x, float y) {
  return 1.0 - abs(sign(x - y));
}

float when_neq(float x, float y) {
  return abs(sign(x - y));
}

float when_gt(float x, float y) {
  return max(sign(x - y), 0.0);
}

float when_lt(float x, float y) {
  return max(sign(y - x), 0.0);
}

float when_ge(float x, float y) {
  return 1.0 - when_lt(x, y);
}

float when_le(float x, float y) {
  return 1.0 - when_gt(x, y);
}

vec4 and(vec4 a, vec4 b) {
  return a * b;
}

vec4 or(vec4 a, vec4 b) {
  return min(a + b, 1.0);
}

vec4 Not(vec4 a) {
  return 1.0 - a;
}

vec3 and(vec3 a, vec3 b) {
  return a * b;
}

vec3 or(vec3 a, vec3 b) {
  return min(a + b, 1.0);
}

vec3 Not(vec3 a) {
  return 1.0 - a;
}

vec2 and(vec2 a, vec2 b) {
  return a * b;
}

vec2 or(vec2 a, vec2 b) {
  return min(a + b, 1.0);
}


vec2 Not(vec2 a) {
  return 1.0 - a;
}

float and(float a, float b) {
  return a * b;
}

float or(float a, float b) {
  return min(a + b, 1.0);
}

float Not(float a) {
  return 1.0 - a;
}{@}curl.glsl{@}#test Device.mobile
float sinf2(float x) {
    x*=0.159155;
    x-=floor(x);
    float xx=x*x;
    float y=-6.87897;
    y=y*xx+33.7755;
    y=y*xx-72.5257;
    y=y*xx+80.5874;
    y=y*xx-41.2408;
    y=y*xx+6.28077;
    return x*y;
}

float cosf2(float x) {
    return sinf2(x+1.5708);
}
#endtest

#test !Device.mobile
    #define sinf2 sin
    #define cosf2 cos
#endtest

float potential1(vec3 v) {
    float noise = 0.0;
    noise += sinf2(v.x * 1.8 + v.z * 3.) + sinf2(v.x * 4.8 + v.z * 4.5) + sinf2(v.x * -7.0 + v.z * 1.2) + sinf2(v.x * -5.0 + v.z * 2.13);
    noise += sinf2(v.y * -0.48 + v.z * 5.4) + sinf2(v.y * 2.56 + v.z * 5.4) + sinf2(v.y * 4.16 + v.z * 2.4) + sinf2(v.y * -4.16 + v.z * 1.35);
    return noise;
}

float potential2(vec3 v) {
    float noise = 0.0;
    noise += sinf2(v.y * 1.8 + v.x * 3. - 2.82) + sinf2(v.y * 4.8 + v.x * 4.5 + 74.37) + sinf2(v.y * -7.0 + v.x * 1.2 - 256.72) + sinf2(v.y * -5.0 + v.x * 2.13 - 207.683);
    noise += sinf2(v.z * -0.48 + v.x * 5.4 -125.796) + sinf2(v.z * 2.56 + v.x * 5.4 + 17.692) + sinf2(v.z * 4.16 + v.x * 2.4 + 150.512) + sinf2(v.z * -4.16 + v.x * 1.35 - 222.137);
    return noise;
}

float potential3(vec3 v) {
    float noise = 0.0;
    noise += sinf2(v.z * 1.8 + v.y * 3. - 194.58) + sinf2(v.z * 4.8 + v.y * 4.5 - 83.13) + sinf2(v.z * -7.0 + v.y * 1.2 -845.2) + sinf2(v.z * -5.0 + v.y * 2.13 - 762.185);
    noise += sinf2(v.x * -0.48 + v.y * 5.4 - 707.916) + sinf2(v.x * 2.56 + v.y * 5.4 + -482.348) + sinf2(v.x * 4.16 + v.y * 2.4 + 9.872) + sinf2(v.x * -4.16 + v.y * 1.35 - 476.747);
    return noise;
}

vec3 snoiseVec3( vec3 x ) {
    float s  = potential1(x);
    float s1 = potential2(x);
    float s2 = potential3(x);
    return vec3( s , s1 , s2 );
}

//Analitic derivatives of the potentials for the curl noise, based on: http://weber.itn.liu.se/~stegu/TNM084-2019/bridson-siggraph2007-curlnoise.pdf

float dP3dY(vec3 v) {
    float noise = 0.0;
    noise += 3. * cosf2(v.z * 1.8 + v.y * 3. - 194.58) + 4.5 * cosf2(v.z * 4.8 + v.y * 4.5 - 83.13) + 1.2 * cosf2(v.z * -7.0 + v.y * 1.2 -845.2) + 2.13 * cosf2(v.z * -5.0 + v.y * 2.13 - 762.185);
    noise += 5.4 * cosf2(v.x * -0.48 + v.y * 5.4 - 707.916) + 5.4 * cosf2(v.x * 2.56 + v.y * 5.4 + -482.348) + 2.4 * cosf2(v.x * 4.16 + v.y * 2.4 + 9.872) + 1.35 * cosf2(v.x * -4.16 + v.y * 1.35 - 476.747);
    return noise;
}

float dP2dZ(vec3 v) {
    return -0.48 * cosf2(v.z * -0.48 + v.x * 5.4 -125.796) + 2.56 * cosf2(v.z * 2.56 + v.x * 5.4 + 17.692) + 4.16 * cosf2(v.z * 4.16 + v.x * 2.4 + 150.512) -4.16 * cosf2(v.z * -4.16 + v.x * 1.35 - 222.137);
}

float dP1dZ(vec3 v) {
    float noise = 0.0;
    noise += 3. * cosf2(v.x * 1.8 + v.z * 3.) + 4.5 * cosf2(v.x * 4.8 + v.z * 4.5) + 1.2 * cosf2(v.x * -7.0 + v.z * 1.2) + 2.13 * cosf2(v.x * -5.0 + v.z * 2.13);
    noise += 5.4 * cosf2(v.y * -0.48 + v.z * 5.4) + 5.4 * cosf2(v.y * 2.56 + v.z * 5.4) + 2.4 * cosf2(v.y * 4.16 + v.z * 2.4) + 1.35 * cosf2(v.y * -4.16 + v.z * 1.35);
    return noise;
}

float dP3dX(vec3 v) {
    return -0.48 * cosf2(v.x * -0.48 + v.y * 5.4 - 707.916) + 2.56 * cosf2(v.x * 2.56 + v.y * 5.4 + -482.348) + 4.16 * cosf2(v.x * 4.16 + v.y * 2.4 + 9.872) -4.16 * cosf2(v.x * -4.16 + v.y * 1.35 - 476.747);
}

float dP2dX(vec3 v) {
    float noise = 0.0;
    noise += 3. * cosf2(v.y * 1.8 + v.x * 3. - 2.82) + 4.5 * cosf2(v.y * 4.8 + v.x * 4.5 + 74.37) + 1.2 * cosf2(v.y * -7.0 + v.x * 1.2 - 256.72) + 2.13 * cosf2(v.y * -5.0 + v.x * 2.13 - 207.683);
    noise += 5.4 * cosf2(v.z * -0.48 + v.x * 5.4 -125.796) + 5.4 * cosf2(v.z * 2.56 + v.x * 5.4 + 17.692) + 2.4 * cosf2(v.z * 4.16 + v.x * 2.4 + 150.512) + 1.35 * cosf2(v.z * -4.16 + v.x * 1.35 - 222.137);
    return noise;
}

float dP1dY(vec3 v) {
    return -0.48 * cosf2(v.y * -0.48 + v.z * 5.4) + 2.56 * cosf2(v.y * 2.56 + v.z * 5.4) +  4.16 * cosf2(v.y * 4.16 + v.z * 2.4) -4.16 * cosf2(v.y * -4.16 + v.z * 1.35);
}


vec3 curlNoise( vec3 p ) {

    //A sinf2 or cosf2 call is a trigonometric function, these functions are expensive in the GPU
    //the partial derivatives with approximations require to calculate the snoiseVec3 function 4 times.
    //The previous function evaluate the potentials that include 8 trigonometric functions each.
    //
    //This means that the potentials are evaluated 12 times (4 calls to snoiseVec3 that make 3 potential calls).
    //The whole process call 12 * 8 trigonometric functions, a total of 96 times.


    /*
    const float e = 1e-1;
    vec3 dx = vec3( e   , 0.0 , 0.0 );
    vec3 dy = vec3( 0.0 , e   , 0.0 );
    vec3 dz = vec3( 0.0 , 0.0 , e   );
    vec3 p0 = snoiseVec3(p);
    vec3 p_x1 = snoiseVec3( p + dx );
    vec3 p_y1 = snoiseVec3( p + dy );
    vec3 p_z1 = snoiseVec3( p + dz );
    float x = p_y1.z - p0.z - p_z1.y + p0.y;
    float y = p_z1.x - p0.x - p_x1.z + p0.z;
    float z = p_x1.y - p0.y - p_y1.x + p0.x;
    return normalize( vec3( x , y , z ));
    */


    //The noise that is used to define the potentials is based on analitic functions that are easy to derivate,
    //meaning that the analitic solution would provide a much faster approach with the same visual results.
    //
    //Usinf2g the analitic derivatives the algorithm does not require to evaluate snoiseVec3, instead it uses the
    //analitic partial derivatives from each potential on the corresponding axis, providing a total of
    //36 calls to trigonometric functions, making the analytic evaluation almost 3 times faster than the aproximation method.


    float x = dP3dY(p) - dP2dZ(p);
    float y = dP1dZ(p) - dP3dX(p);
    float z = dP2dX(p) - dP1dY(p);


    return normalize( vec3( x , y , z ));



}{@}depthvalue.fs{@}float getDepthValue(sampler2D tDepth, vec2 uv, float n, float f) {
    vec4 depth = texture2D(tDepth, uv);
    return (2.0 * n) / (f + n - depth.x * (f - n));
}

float getDepthValue(float z, float n, float f) {
    return (2.0 * n) / (f + n - z * (f - n));
}

float getEyeZ(float depth, float n, float f) {
    float z = depth * 2.0 - 1.0;
    return (2.0 * n * f) / (f + n - z * (f - n));
}

vec3 eyePosFromDepth(sampler2D tDepth, vec2 c, float n, float f) {
    float eyeZ = getEyeZ(texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).x, n, f);
    float x = ((1.0 - projectionMatrix[2][0]) / projectionMatrix[0][0]) - (2.0 * (c.x + 0.5) / (resolution.x * projectionMatrix[0][0]));
    float y = ((1.0 + projectionMatrix[2][1]) / projectionMatrix[1][1]) - (2.0 * (c.y + 0.5) / (resolution.y * projectionMatrix[1][1]));
    return vec3(vec2(x,y) * -eyeZ, -eyeZ);
}

vec3 eyePosFromDepth(float depth, float n, float f, vec2 c, bool linearDepth) {
    float eyeZ = linearDepth ? depth : getEyeZ(depth, n, f);
    float x = ((1.0 - projectionMatrix[2][0]) / projectionMatrix[0][0]) - (2.0 * (c.x + 0.5) / (resolution.x * projectionMatrix[0][0]));
    float y = ((1.0 + projectionMatrix[2][1]) / projectionMatrix[1][1]) - (2.0 * (c.y + 0.5) / (resolution.y * projectionMatrix[1][1]));
    return vec3(vec2(x,y) * -eyeZ, -eyeZ);
}

vec3 worldPosFromDepth(sampler2D tDepth) {
    float depth = texture2D(tDepth, vUv).r;
    float z = depth * 2.0 - 1.0;

    vec4 clipSpacePosition = vec4(vUv * 2.0 - 1.0, z, 1.0);
    vec4 viewSpacePosition = inverse(projectionMatrix) * clipSpacePosition;

    // Perspective division
    viewSpacePosition /= viewSpacePosition.w;

    vec4 worldSpacePosition = inverse(viewMatrix) * viewSpacePosition;

    return worldSpacePosition.xyz;
}
{@}eases.glsl{@}#ifndef PI
#define PI 3.141592653589793
#endif

#ifndef HALF_PI
#define HALF_PI 1.5707963267948966
#endif

float backInOut(float t) {
  float f = t < 0.5
    ? 2.0 * t
    : 1.0 - (2.0 * t - 1.0);

  float g = pow(f, 3.0) - f * sin(f * PI);

  return t < 0.5
    ? 0.5 * g
    : 0.5 * (1.0 - g) + 0.5;
}

float backIn(float t) {
  return pow(t, 3.0) - t * sin(t * PI);
}

float backOut(float t) {
  float f = 1.0 - t;
  return 1.0 - (pow(f, 3.0) - f * sin(f * PI));
}

float bounceOut(float t) {
  const float a = 4.0 / 11.0;
  const float b = 8.0 / 11.0;
  const float c = 9.0 / 10.0;

  const float ca = 4356.0 / 361.0;
  const float cb = 35442.0 / 1805.0;
  const float cc = 16061.0 / 1805.0;

  float t2 = t * t;

  return t < a
    ? 7.5625 * t2
    : t < b
      ? 9.075 * t2 - 9.9 * t + 3.4
      : t < c
        ? ca * t2 - cb * t + cc
        : 10.8 * t * t - 20.52 * t + 10.72;
}

float bounceIn(float t) {
  return 1.0 - bounceOut(1.0 - t);
}

float bounceInOut(float t) {
  return t < 0.5
    ? 0.5 * (1.0 - bounceOut(1.0 - t * 2.0))
    : 0.5 * bounceOut(t * 2.0 - 1.0) + 0.5;
}

float circularInOut(float t) {
  return t < 0.5
    ? 0.5 * (1.0 - sqrt(1.0 - 4.0 * t * t))
    : 0.5 * (sqrt((3.0 - 2.0 * t) * (2.0 * t - 1.0)) + 1.0);
}

float circularIn(float t) {
  return 1.0 - sqrt(1.0 - t * t);
}

float circularOut(float t) {
  return sqrt((2.0 - t) * t);
}

float cubicInOut(float t) {
  return t < 0.5
    ? 4.0 * t * t * t
    : 0.5 * -pow(2.0 - 2.0 * t, 3.0) + 1.0;
}

float cubicIn(float t) {
  return t * t * t;
}

float cubicOut(float t) {
  float f = t - 1.0;
  return f * f * f + 1.0;
}

float elasticInOut(float t) {
  return t < 0.5
    ? 0.5 * sin(+13.0 * HALF_PI * 2.0 * t) * pow(2.0, 10.0 * (2.0 * t - 1.0))
    : 0.5 * sin(-13.0 * HALF_PI * ((2.0 * t - 1.0) + 1.0)) * pow(2.0, -10.0 * (2.0 * t - 1.0)) + 1.0;
}

float elasticIn(float t) {
  return sin(13.0 * t * HALF_PI) * pow(2.0, 10.0 * (t - 1.0));
}

float elasticOut(float t) {
  return sin(-13.0 * (t + 1.0) * HALF_PI) * pow(2.0, -10.0 * t) + 1.0;
}

float expoInOut(float t) {
  return t == 0.0 || t == 1.0
    ? t
    : t < 0.5
      ? +0.5 * pow(2.0, (20.0 * t) - 10.0)
      : -0.5 * pow(2.0, 10.0 - (t * 20.0)) + 1.0;
}

float expoIn(float t) {
  return t == 0.0 ? t : pow(2.0, 10.0 * (t - 1.0));
}

float expoOut(float t) {
  return t == 1.0 ? t : 1.0 - pow(2.0, -10.0 * t);
}

float linear(float t) {
  return t;
}

float quadraticInOut(float t) {
  float p = 2.0 * t * t;
  return t < 0.5 ? p : -p + (4.0 * t) - 1.0;
}

float quadraticIn(float t) {
  return t * t;
}

float quadraticOut(float t) {
  return -t * (t - 2.0);
}

float quarticInOut(float t) {
  return t < 0.5
    ? +8.0 * pow(t, 4.0)
    : -8.0 * pow(1.0 - t, 4.0) + 1.0;
}

float quarticIn(float t) {
  return pow(t, 4.0);
}

float quarticOut(float t) {
  return pow(1.0 - t, 3.0) * (t - 1.0) + 1.0;
}

float qinticInOut(float t) {
  return t < 0.5
    ? +16.0 * pow(t, 5.0)
    : -0.5 * pow(2.0 * t - 2.0, 5.0) + 1.0;
}

float qinticIn(float t) {
  return pow(t, 5.0);
}

float qinticOut(float t) {
  return 1.0 - (pow(1.0 - t, 5.0));
}

float sineInOut(float t) {
  return -0.5 * (cos(PI * t) - 1.0);
}

float sineIn(float t) {
  return sin((t - 1.0) * HALF_PI) + 1.0;
}

float sineOut(float t) {
  return sin(t * HALF_PI);
}
{@}ColorMaterial.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 color;
uniform float alpha;

#!VARYINGS

#!SHADER: ColorMaterial.vs
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: ColorMaterial.fs
void main() {
    gl_FragColor = vec4(color, alpha);
}{@}DebugCamera.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uColor;

#!VARYINGS
varying vec3 vColor;

#!SHADER: DebugCamera.vs
void main() {
    vColor = mix(uColor, vec3(1.0, 0.0, 0.0), step(position.z, -0.1));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: DebugCamera.fs
void main() {
    gl_FragColor = vec4(vColor, 1.0);
}{@}OcclusionMaterial.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 bbMin;
uniform vec3 bbMax;

#!VARYINGS

#!SHADER: Vertex.vs
void main() {
    vec3 pos = position;
    pos *= bbMax - bbMin;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
void main() {
    gl_FragColor = vec4(1.0);
}{@}ScreenQuad.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;

#!VARYINGS

#!SHADER: ScreenQuad.vs
void main() {
    gl_Position = vec4(position, 1.0);
}

#!SHADER: ScreenQuad.fs
void main() {
    gl_FragColor = texture2D(tMap, gl_FragCoord.xy / resolution);
    gl_FragColor.a = 1.0;
}{@}ScreenQuadVR.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uEye;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex

vec2 scaleUV(vec2 uv, vec2 scale, vec2 origin) {
    vec2 st = uv - origin;
    st /= scale;
    return st + origin;
}

void main() {
    vUv = scaleUV(uv, vec2(2.0, 1.0), vec2(0.0)) - vec2(uEye, 0.0);
    gl_Position = vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = texture2D(tMap, vUv);
}{@}TestMaterial.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform float alpha;

#!VARYINGS
varying vec3 vNormal;

#!SHADER: TestMaterial.vs
void main() {
    vec3 pos = position;
    vNormal = normalMatrix * normal;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: TestMaterial.fs
void main() {
    gl_FragColor = vec4(vNormal, 1.0);
}{@}TextureMaterial.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;

#!VARYINGS
varying vec2 vUv;

#!SHADER: TextureMaterial.vs
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: TextureMaterial.fs
void main() {
    gl_FragColor = texture2D(tMap, vUv);
    gl_FragColor.rgb /= gl_FragColor.a;
}{@}BlitPass.fs{@}void main() {
    gl_FragColor = texture2D(tDiffuse, vUv);
    gl_FragColor.a = 1.0;
}{@}NukePass.vs{@}varying vec2 vUv;

void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}{@}ShadowDepth.glsl{@}#!ATTRIBUTES

#!UNIFORMS

#!VARYINGS

#!SHADER: ShadowDepth.vs
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: ShadowDepth.fs
void main() {
    gl_FragColor = vec4(vec3(gl_FragCoord.x), 1.0);
}{@}instance.vs{@}vec3 transformNormal(vec3 n, vec4 orientation) {
    vec3 nn = n + 2.0 * cross(orientation.xyz, cross(orientation.xyz, n) + orientation.w * n);
    return nn;
}

vec3 transformPosition(vec3 position, vec3 offset, vec3 scale, vec4 orientation) {
    vec3 _pos = position;
    _pos *= scale;

    _pos = _pos + 2.0 * cross(orientation.xyz, cross(orientation.xyz, _pos) + orientation.w * _pos);
    _pos += offset;
    return _pos;
}

vec3 transformPosition(vec3 position, vec3 offset, vec4 orientation) {
    vec3 _pos = position;

    _pos = _pos + 2.0 * cross(orientation.xyz, cross(orientation.xyz, _pos) + orientation.w * _pos);
    _pos += offset;
    return _pos;
}

vec3 transformPosition(vec3 position, vec3 offset, float scale, vec4 orientation) {
    return transformPosition(position, offset, vec3(scale), orientation);
}

vec3 transformPosition(vec3 position, vec3 offset) {
    return position + offset;
}

vec3 transformPosition(vec3 position, vec3 offset, float scale) {
    vec3 pos = position * scale;
    return pos + offset;
}

vec3 transformPosition(vec3 position, vec3 offset, vec3 scale) {
    vec3 pos = position * scale;
    return pos + offset;
}{@}lights.fs{@}vec3 worldLight(vec3 pos, vec3 vpos) {
    vec4 mvPos = modelViewMatrix * vec4(vpos, 1.0);
    vec4 worldPosition = viewMatrix * vec4(pos, 1.0);
    return worldPosition.xyz - mvPos.xyz;
}{@}lights.vs{@}vec3 worldLight(vec3 pos) {
    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
    vec4 worldPosition = viewMatrix * vec4(pos, 1.0);
    return worldPosition.xyz - mvPos.xyz;
}

vec3 worldLight(vec3 lightPos, vec3 localPos) {
    vec4 mvPos = modelViewMatrix * vec4(localPos, 1.0);
    vec4 worldPosition = viewMatrix * vec4(lightPos, 1.0);
    return worldPosition.xyz - mvPos.xyz;
}{@}shadows.fs{@}#define PI2 6.2831853072
#define PI 3.141592653589793

#define MAX_PCSS_SAMPLES 17
vec2 poissonDisk[MAX_PCSS_SAMPLES];

struct PCSShadowConfig {
    int sampleCount;
    int ringCount;
    float lightWorldSize;
    float lightFrustumWidth;
    float nearPlane;
};

PCSShadowConfig defaultPCSSShadowConfig() {
    PCSShadowConfig config;
    config.sampleCount = 10;
    config.ringCount = 11;
    config.lightWorldSize = 0.3;
    config.lightFrustumWidth = 6.75;
    config.nearPlane = 6.5;
    return config;
}

bool frustumTest(vec3 coords) {
    return coords.x >= 0.0 && coords.x <= 1.0 && coords.y >= 0.0 && coords.y <= 1.0 && coords.z <= 1.0;
}

float rand(float n){return fract(sin(n) * 43758.5453123);}
highp float rand( const in vec2 uv ) {
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;
    highp float dt = dot( uv.xy, vec2( a, b ) ), sn = mod( dt, PI );
    return fract( sin( sn ) * c );
}

void initPoissonSamples(const in vec2 randomSeed, PCSShadowConfig config) {
    float angleStep = PI2 * float(config.ringCount) / float(config.sampleCount);
    float invSampleCount = 1.0 / float(config.sampleCount);
    float angle = rand(randomSeed) * PI2;
    float radius = invSampleCount;
    float radiusStep = radius;
    
    for(int i = 0; i < MAX_PCSS_SAMPLES; i ++ ) {
        if( i > config.sampleCount ) {
            break;
        }
        poissonDisk[i] = vec2(cos(angle), sin(angle)) * pow(radius, 0.75);
        radius += radiusStep;
        angle += angleStep;
    }
}

float penumbraSize(const in float zReceiver, const in float zBlocker) {
    return (zReceiver - zBlocker) / zBlocker;
}

float findBlocker(sampler2D shadowMap, const in vec2 uv, const in float zReceiver, PCSShadowConfig config) {
    // This uses similar triangles to compute what
    // area of the shadow map we should search
    float lightSizeUV = config.lightWorldSize / config.lightFrustumWidth;
    float searchRadius = lightSizeUV * (zReceiver - config.nearPlane) / zReceiver;
    float blockerDepthSum = 0.0;
    int numBlockers = 0;
    
    for(int i = 0; i < MAX_PCSS_SAMPLES; i ++ ) {
        if( i > config.sampleCount ) {
            break;
        }
        float shadowMapDepth = texture2D(shadowMap, uv + poissonDisk[i] * searchRadius).r;
        if (shadowMapDepth < zReceiver) {
            blockerDepthSum += shadowMapDepth;
            numBlockers ++ ;
        }
    }
    
    if (numBlockers == 0)return -1.0;
    
    return blockerDepthSum / float(numBlockers);
}

float pcfFilter(sampler2D shadowMap, vec2 uv, float zReceiver, float filterRadius, PCSShadowConfig config) {
    float sum = 0.0;
    float depth;
    int numSamples = config.sampleCount;
    for(int i = 0; i < MAX_PCSS_SAMPLES; i ++ ) {
        if( i > numSamples ) {
            break;
        }
        depth = texture2D(shadowMap, uv + poissonDisk[i] * filterRadius).r;
        if (zReceiver <= depth) sum += 1.0;
    }
    for(int i = 0; i < MAX_PCSS_SAMPLES; i ++ ) {
        if( i > numSamples ) {
            break;
        }
        depth = texture2D(shadowMap, uv + -poissonDisk[i].yx * filterRadius).r;
        if (zReceiver <= depth) sum += 1.0;
    }
    return sum / (2.0 * float(numSamples));
}

float PCSS(sampler2D shadowMap, vec3 coords, PCSShadowConfig config) {
    vec2 uv = coords.xy;
    float zReceiver = coords.z; // Assumed to be eye-space z in this code
    
    initPoissonSamples(uv, config);
    
    float avgBlockerDepth = findBlocker(shadowMap, uv, zReceiver, config);
    if (avgBlockerDepth == -1.0)return 1.0; 

    float penumbraRatio = penumbraSize(zReceiver, avgBlockerDepth);
    float lightSizeUV = config.lightWorldSize / config.lightFrustumWidth;
    float filterRadius = penumbraRatio * lightSizeUV * config.nearPlane / zReceiver;    

    return pcfFilter(shadowMap, uv, zReceiver, filterRadius, config);
}

float shadowLookupPCSS(sampler2D map, vec3 coords, float size, float compare, vec3 wpos, PCSShadowConfig config) {
    float shadow = 1.0;
    bool frustumTest = frustumTest(coords);
    if (frustumTest) {
        shadow = PCSS(map, coords, config);
    }
    return clamp(shadow, 0.0, 1.0);
}

float shadowCompare(sampler2D map, vec2 coords, float compare) {
    return step(compare, texture2D(map, coords).r);
}

float shadowLerp(sampler2D map, vec2 coords, float compare, float size) {
    const vec2 offset = vec2(0.0, 1.0);

    vec2 texelSize = vec2(1.0) / size;
    vec2 centroidUV = floor(coords * size + 0.5) / size;

    float lb = shadowCompare(map, centroidUV + texelSize * offset.xx, compare);
    float lt = shadowCompare(map, centroidUV + texelSize * offset.xy, compare);
    float rb = shadowCompare(map, centroidUV + texelSize * offset.yx, compare);
    float rt = shadowCompare(map, centroidUV + texelSize * offset.yy, compare);

    vec2 f = fract( coords * size + 0.5 );

    float a = mix( lb, lt, f.y );
    float b = mix( rb, rt, f.y );
    float c = mix( a, b, f.x );

    return c;
}

float srange(float oldValue, float oldMin, float oldMax, float newMin, float newMax) {
    float oldRange = oldMax - oldMin;
    float newRange = newMax - newMin;
    return (((oldValue - oldMin) * newRange) / oldRange) + newMin;
}

float shadowrandom(vec3 vin) {
    vec3 v = vin * 0.1;
    float t = v.z * 0.3;
    v.y *= 0.8;
    float noise = 0.0;
    float s = 0.5;
    noise += srange(sin(v.x * 0.9 / s + t * 10.0) + sin(v.x * 2.4 / s + t * 15.0) + sin(v.x * -3.5 / s + t * 4.0) + sin(v.x * -2.5 / s + t * 7.1), -1.0, 1.0, -0.3, 0.3);
    noise += srange(sin(v.y * -0.3 / s + t * 18.0) + sin(v.y * 1.6 / s + t * 18.0) + sin(v.y * 2.6 / s + t * 8.0) + sin(v.y * -2.6 / s + t * 4.5), -1.0, 1.0, -0.3, 0.3);
    return noise;
}

float shadowLookup(sampler2D map, vec3 coords, float size, float compare, vec3 wpos) {
    float shadow = 1.0;

    #if defined(SHADOW_MAPS)
    bool frustumTest = coords.x >= 0.0 && coords.x <= 1.0 && coords.y >= 0.0 && coords.y <= 1.0 && coords.z <= 1.0;
    if (frustumTest) {
        
        vec2 texelSize = vec2(1.0) / size;

        float dx0 = -texelSize.x;
        float dy0 = -texelSize.y;
        float dx1 = +texelSize.x;
        float dy1 = +texelSize.y;

        float rnoise = shadowrandom(wpos) * 0.00015;
        dx0 += rnoise;
        dy0 -= rnoise;
        dx1 += rnoise;
        dy1 -= rnoise;

        #if defined(SHADOWS_MED)
        shadow += shadowCompare(map, coords.xy + vec2(0.0, dy0), compare);
        //        shadow += shadowCompare(map, coords.xy + vec2(dx1, dy0), compare);
        shadow += shadowCompare(map, coords.xy + vec2(dx0, 0.0), compare);
        shadow += shadowCompare(map, coords.xy, compare);
        shadow += shadowCompare(map, coords.xy + vec2(dx1, 0.0), compare);
        //        shadow += shadowCompare(map, coords.xy + vec2(dx0, dy1), compare);
        shadow += shadowCompare(map, coords.xy + vec2(0.0, dy1), compare);
        shadow /= 5.0;

        #elif defined(SHADOWS_HIGH)
        shadow = shadowLerp(map, coords.xy + vec2(dx0, dy0), compare, size);
        shadow += shadowLerp(map, coords.xy + vec2(0.0, dy0), compare, size);
        shadow += shadowLerp(map, coords.xy + vec2(dx1, dy0), compare, size);
        shadow += shadowLerp(map, coords.xy + vec2(dx0, 0.0), compare, size);
        shadow += shadowLerp(map, coords.xy, compare, size);
        shadow += shadowLerp(map, coords.xy + vec2(dx1, 0.0), compare, size);
        shadow += shadowLerp(map, coords.xy + vec2(dx0, dy1), compare, size);
        shadow += shadowLerp(map, coords.xy + vec2(0.0, dy1), compare, size);
        shadow += shadowLerp(map, coords.xy + vec2(dx1, dy1), compare, size);
        shadow /= 9.0;

        #else
        shadow = shadowCompare(map, coords.xy, compare);
        #endif
    }

        #endif

    return clamp(shadow, 0.0, 1.0);
}

#test !!window.Metal
vec3 transformShadowLight(vec3 pos, vec3 vpos, mat4 mvMatrix, mat4 viewMatrix) {
    vec4 mvPos = mvMatrix * vec4(vpos, 1.0);
    vec4 worldPosition = viewMatrix * vec4(pos, 1.0);
    return normalize(worldPosition.xyz - mvPos.xyz);
}

float getShadow(vec3 pos, vec3 normal, float bias, Uniforms uniforms, GlobalUniforms globalUniforms, sampler2D shadowMap) {
    float shadow = 1.0;
    #if defined(SHADOW_MAPS)

    vec4 shadowMapCoords;
    vec3 coords;
    float lookup;

    for (int i = 0; i < SHADOW_COUNT; i++) {
        shadowMapCoords = uniforms.shadowMatrix[i] * vec4(pos, 1.0);
        coords = (shadowMapCoords.xyz / shadowMapCoords.w) * vec3(0.5) + vec3(0.5);
        lookup = shadowLookup(shadowMap, coords, uniforms.shadowSize[i], coords.z - bias, pos);
        lookup += mix(1.0 - step(0.002, dot(transformShadowLight(uniforms.shadowLightPos[i], pos, uniforms.modelViewMatrix, globalUniforms.viewMatrix), normal)), 0.0, step(999.0, normal.x));
        shadow *= clamp(lookup, 0.0, 1.0);
    }

    #endif
    return shadow;
}

float getShadow(vec3 pos, vec3 normal, Uniforms uniforms, GlobalUniforms globalUniforms, sampler2D shadowMap) {
    return getShadow(pos, normal, 0.0, uniforms, globalUniforms, shadowMap);
}

float getShadow(vec3 pos, float bias, Uniforms uniforms, GlobalUniforms globalUniforms, sampler2D shadowMap) {
    return getShadow(pos, vec3(99999.0), bias, uniforms, globalUniforms, shadowMap);
}

float getShadow(vec3 pos, Uniforms uniforms, GlobalUniforms globalUniforms, sampler2D shadowMap) {
    return getShadow(pos, vec3(99999.0), 0.0, uniforms, globalUniforms, shadowMap);
}

float getShadow(vec3 pos, vec3 normal) {
    return 1.0;
}

float getShadow(vec3 pos, float bias) {
    return 1.0;
}

float getShadow(vec3 pos) {
    return 1.0;
}

float getShadowPCSS(vec3 pos, vec3 normal, Uniforms uniforms, GlobalUniforms globalUniforms, sampler2D shadowMap, PCSShadowConfig config) {
    float shadow = 1.0;
    #if defined(SHADOW_MAPS)

    vec4 shadowMapCoords;
    vec3 coords;
    float lookup;

    for (int i = 0; i < SHADOW_COUNT; i++) {
        shadowMapCoords = uniforms.shadowMatrix[i] * vec4(pos, 1.0);
        coords = (shadowMapCoords.xyz / shadowMapCoords.w) * vec3(0.5) + vec3(0.5);
        lookup = shadowLookupPCSS(shadowMap, coords, uniforms.shadowSize[i], coords.z - bias, pos);
        lookup += mix(1.0 - step(0.002, dot(transformShadowLight(uniforms.shadowLightPos[i], pos, uniforms.modelViewMatrix, globalUniforms.viewMatrix), normal)), 0.0, step(999.0, normal.x));
        shadow *= clamp(lookup, 0.0, 1.0);
    }

    #endif
    return shadow;
}

float getShadowPCSS(vec3 pos, vec3 normal, Uniforms uniforms, GlobalUniforms globalUniforms, sampler2D shadowMap) {
    PCSShadowConfig config = defaultPCSSShadowConfig();
    return getShadowPCSS(pos, normal, bias, config);
}

#endtest

#test !window.Metal
vec3 transformShadowLight(vec3 pos, vec3 vpos) {
    vec4 mvPos = modelViewMatrix * vec4(vpos, 1.0);
    vec4 worldPosition = viewMatrix * vec4(pos, 1.0);
    return normalize(worldPosition.xyz - mvPos.xyz);
}

float getShadow(vec3 pos, vec3 normal, float bias) {

    float shadow = 1.0;
    #if defined(SHADOW_MAPS)

    vec4 shadowMapCoords;
    vec3 coords;
    float lookup;

    #pragma unroll_loop
    for (int i = 0; i < SHADOW_COUNT; i++) {
        shadowMapCoords = shadowMatrix[i] * vec4(pos, 1.0);
        coords = (shadowMapCoords.xyz / shadowMapCoords.w) * vec3(0.5) + vec3(0.5);
        lookup = shadowLookup(shadowMap[i], coords, shadowSize[i], coords.z - bias, pos);        
        lookup += mix(1.0 - step(0.002, dot(transformShadowLight(shadowLightPos[i], pos), normal)), 0.0, step(999.0, normal.x));
        shadow *= clamp(lookup, 0.0, 1.0);
    }
    #endif
    return shadow;
}

float getShadow(vec3 pos, vec3 normal) {
    return getShadow(pos, normal, 0.0);
}

float getShadow(vec3 pos, float bias) {
    return getShadow(pos, vec3(99999.0), bias);
}

float getShadow(vec3 pos) {
    return getShadow(pos, vec3(99999.0), 0.0);
}

float getShadowPCSS(vec3 pos, vec3 normal, float bias, PCSShadowConfig config) {    
    float shadow = 1.0;
    #if defined(SHADOW_MAPS)

    vec4 shadowMapCoords;
    vec3 coords;
    float lookup;

    #pragma unroll_loop
    for (int i = 0; i < SHADOW_COUNT; i++) {
        shadowMapCoords = shadowMatrix[i] * vec4(pos, 1.0);
        coords = (shadowMapCoords.xyz / shadowMapCoords.w) * vec3(0.5) + vec3(0.5);
        lookup = shadowLookupPCSS(shadowMap[i], coords, shadowSize[i], coords.z - bias, pos, config);
        lookup += mix(1.0 - step(0.002, dot(transformShadowLight(shadowLightPos[i], pos), normal)), 0.0, step(999.0, normal.x));
        shadow *= clamp(lookup, 0.0, 1.0);
    }
    #endif
    
    return shadow;
}

float getShadowPCSS(vec3 pos, vec3 normal, float bias) {
    PCSShadowConfig config = defaultPCSSShadowConfig();
    return getShadowPCSS(pos, normal, bias, config);
}
#endtest{@}FXAA.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMask;

#!VARYINGS
varying vec2 v_rgbNW;
varying vec2 v_rgbNE;
varying vec2 v_rgbSW;
varying vec2 v_rgbSE;
varying vec2 v_rgbM;

#!SHADER: FXAA.vs

varying vec2 vUv;

void main() {
    vUv = uv;

    vec2 fragCoord = uv * resolution;
    vec2 inverseVP = 1.0 / resolution.xy;
    v_rgbNW = (fragCoord + vec2(-1.0, -1.0)) * inverseVP;
    v_rgbNE = (fragCoord + vec2(1.0, -1.0)) * inverseVP;
    v_rgbSW = (fragCoord + vec2(-1.0, 1.0)) * inverseVP;
    v_rgbSE = (fragCoord + vec2(1.0, 1.0)) * inverseVP;
    v_rgbM = vec2(fragCoord * inverseVP);

    gl_Position = vec4(position, 1.0);
}

#!SHADER: FXAA.fs

#require(conditionals.glsl)

#ifndef FXAA_REDUCE_MIN
    #define FXAA_REDUCE_MIN   (1.0/ 128.0)
#endif
#ifndef FXAA_REDUCE_MUL
    #define FXAA_REDUCE_MUL   (1.0 / 8.0)
#endif
#ifndef FXAA_SPAN_MAX
    #define FXAA_SPAN_MAX     8.0
#endif

vec4 fxaa(sampler2D tex, vec2 fragCoord, vec2 resolution,
            vec2 v_rgbNW, vec2 v_rgbNE,
            vec2 v_rgbSW, vec2 v_rgbSE,
            vec2 v_rgbM) {
    vec4 color;
    mediump vec2 inverseVP = vec2(1.0 / resolution.x, 1.0 / resolution.y);
    vec3 rgbNW = texture2D(tex, v_rgbNW).xyz;
    vec3 rgbNE = texture2D(tex, v_rgbNE).xyz;
    vec3 rgbSW = texture2D(tex, v_rgbSW).xyz;
    vec3 rgbSE = texture2D(tex, v_rgbSE).xyz;
    vec4 texColor = texture2D(tex, v_rgbM);
    vec3 rgbM  = texColor.xyz;
    vec3 luma = vec3(0.299, 0.587, 0.114);
    float lumaNW = dot(rgbNW, luma);
    float lumaNE = dot(rgbNE, luma);
    float lumaSW = dot(rgbSW, luma);
    float lumaSE = dot(rgbSE, luma);
    float lumaM  = dot(rgbM,  luma);
    float lumaMin = min(lumaM, min(min(lumaNW, lumaNE), min(lumaSW, lumaSE)));
    float lumaMax = max(lumaM, max(max(lumaNW, lumaNE), max(lumaSW, lumaSE)));

    mediump vec2 dir;
    dir.x = -((lumaNW + lumaNE) - (lumaSW + lumaSE));
    dir.y =  ((lumaNW + lumaSW) - (lumaNE + lumaSE));

    float dirReduce = max((lumaNW + lumaNE + lumaSW + lumaSE) *
                          (0.25 * FXAA_REDUCE_MUL), FXAA_REDUCE_MIN);

    float rcpDirMin = 1.0 / (min(abs(dir.x), abs(dir.y)) + dirReduce);
    dir = min(vec2(FXAA_SPAN_MAX, FXAA_SPAN_MAX),
              max(vec2(-FXAA_SPAN_MAX, -FXAA_SPAN_MAX),
              dir * rcpDirMin)) * inverseVP;

    vec3 rgbA = 0.5 * (
        texture2D(tex, fragCoord * inverseVP + dir * (1.0 / 3.0 - 0.5)).xyz +
        texture2D(tex, fragCoord * inverseVP + dir * (2.0 / 3.0 - 0.5)).xyz);
    vec3 rgbB = rgbA * 0.5 + 0.25 * (
        texture2D(tex, fragCoord * inverseVP + dir * -0.5).xyz +
        texture2D(tex, fragCoord * inverseVP + dir * 0.5).xyz);

    float lumaB = dot(rgbB, luma);

    color = vec4(rgbB, texColor.a);
    color = mix(color, vec4(rgbA, texColor.a), when_lt(lumaB, lumaMin));
    color = mix(color, vec4(rgbA, texColor.a), when_gt(lumaB, lumaMax));

    return color;
}

void main() {
    vec2 fragCoord = vUv * resolution;
    float mask = texture2D(tMask, vUv).r;
    if (mask < 0.5) {
        gl_FragColor = fxaa(tDiffuse, fragCoord, resolution, v_rgbNW, v_rgbNE, v_rgbSW, v_rgbSE, v_rgbM);
    } else {
        gl_FragColor = texture2D(tDiffuse, vUv);
    }
    gl_FragColor.a = 1.0;
}
{@}glscreenprojection.glsl{@}vec2 frag_coord(vec4 glPos) {
    return ((glPos.xyz / glPos.w) * 0.5 + 0.5).xy;
}

vec2 getProjection(vec3 pos, mat4 projMatrix) {
    vec4 mvpPos = projMatrix * vec4(pos, 1.0);
    return frag_coord(mvpPos);
}

void applyNormal(inout vec3 pos, mat4 projNormalMatrix) {
    vec3 transformed = vec3(projNormalMatrix * vec4(pos, 0.0));
    pos = transformed;
}{@}DefaultText.glsl{@}#!ATTRIBUTES

#!UNIFORMS

uniform sampler2D tMap;
uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS

varying vec2 vUv;

#!SHADER: DefaultText.vs

void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: DefaultText.fs

#require(msdf.glsl)

void main() {
    float alpha = msdf(tMap, vUv);

    gl_FragColor.rgb = uColor;
    gl_FragColor.a = alpha * uAlpha;
}
{@}msdf.glsl{@}float msdf(vec3 tex, vec2 uv) {
    // TODO: fallback for fwidth for webgl1 (need to enable ext)
    float signedDist = max(min(tex.r, tex.g), min(max(tex.r, tex.g), tex.b)) - 0.5;
    float d = fwidth(signedDist);
    float alpha = smoothstep(-d, d, signedDist);
    if (alpha < 0.01) discard;
    return alpha;
}

float msdf(sampler2D tMap, vec2 uv) {
    vec3 tex = texture2D(tMap, uv).rgb;
    return msdf( tex, uv );
}

float strokemsdf(sampler2D tMap, vec2 uv, float stroke, float padding) {
    vec3 tex = texture2D(tMap, uv).rgb;
    float signedDist = max(min(tex.r, tex.g), min(max(tex.r, tex.g), tex.b)) - 0.5;
    float t = stroke;
    float alpha = smoothstep(-t, -t + padding, signedDist) * smoothstep(t, t - padding, signedDist);
    return alpha;
}{@}GLUIBatch.glsl{@}#!ATTRIBUTES
attribute vec3 offset;
attribute vec2 scale;
attribute float rotation;
//attributes

#!UNIFORMS
uniform sampler2D tMap;
uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;
//varyings

#!SHADER: Vertex

mat4 rotationMatrix(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
    0.0,                                0.0,                                0.0,                                1.0);
}

void main() {
    vUv = uv;
    //vdefines

    vec3 pos = vec3(rotationMatrix(vec3(0.0, 0.0, 1.0), rotation) * vec4(position, 1.0));
    pos.xy *= scale;
    pos.xyz += offset;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = vec4(1.0);
}{@}GLUIBatchText.glsl{@}#!ATTRIBUTES
attribute vec3 offset;
attribute vec2 scale;
attribute float rotation;
//attributes

#!UNIFORMS
uniform sampler2D tMap;
uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;
//varyings

#!SHADER: Vertex

mat4 lrotationMatrix(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
    oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
    oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
    0.0,                                0.0,                                0.0,                                1.0);
}

void main() {
    vUv = uv;
    //vdefines

    vec3 pos = vec3(lrotationMatrix(vec3(0.0, 0.0, 1.0), rotation) * vec4(position, 1.0));

    //custommain

    pos.xy *= scale;
    pos += offset;

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment

#require(msdf.glsl)

void main() {
    float alpha = msdf(tMap, vUv);

    gl_FragColor.rgb = v_uColor;
    gl_FragColor.a = alpha * v_uAlpha;
}
{@}GLUIColor.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: GLUIColor.vs
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: GLUIColor.fs
void main() {
    vec2 uv = vUv;
    vec3 uvColor = vec3(uv, 1.0);
    gl_FragColor = vec4(mix(uColor, uvColor, 0.0), uAlpha);
}{@}GLUIObject.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: GLUIObject.vs
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: GLUIObject.fs
void main() {
    gl_FragColor = texture2D(tMap, vUv);
    gl_FragColor.a *= uAlpha;
}{@}gluimask.fs{@}uniform vec4 uMaskValues;

#require(range.glsl)

vec2 getMaskUV() {
    vec2 ores = gl_FragCoord.xy / resolution;
    vec2 uv;
    uv.x = range(ores.x, uMaskValues.x, uMaskValues.z, 0.0, 1.0);
    uv.y = 1.0 - range(1.0 - ores.y, uMaskValues.y, uMaskValues.w, 0.0, 1.0);
    return uv;
}{@}lodblur.fs{@}float lodweight(float t, float log2radius, float gamma) {
	return exp(-gamma*pow(log2radius-t,2.));
}


vec4 lodBlur(sampler2D tMap, vec2 uv, float radius, float gamma) {
	vec4 pix = vec4(0.);
	float norm = 0.;
	//weighted integration over mipmap levels
	for(float i = 0.; i < 10.; i += 0.5)
	{
		float k = lodweight(i, log2(radius), gamma);
		pix += k*textureLod(tMap, uv, i);
		norm += k;
	}
	//nomalize, and a bit of brigtness hacking
	return pix*pow(norm,-0.99);
}
{@}matrix.glsl{@}mat4 scale(float x, float y, float z){
    return mat4(
        vec4(x,   0.0, 0.0, 0.0),
        vec4(0.0, y,   0.0, 0.0),
        vec4(0.0, 0.0, z,   0.0),
        vec4(0.0, 0.0, 0.0, 1.0)
    );
}

mat4 translate(float x, float y, float z){
    return mat4(
        vec4(1.0, 0.0, 0.0, 0.0),
        vec4(0.0, 1.0, 0.0, 0.0),
        vec4(0.0, 0.0, 1.0, 0.0),
        vec4(x,   y,   z,   1.0)
    );
}

mat4 RotateX(float phi){
    return mat4(
        vec4(1.,0.,0.,0),
        vec4(0.,cos(phi),-sin(phi),0.),
        vec4(0.,sin(phi),cos(phi),0.),
        vec4(0.,0.,0.,1.));
}

mat4 RotateY(float theta){
    return mat4(
        vec4(cos(theta),0.,-sin(theta),0),
        vec4(0.,1.,0.,0.),
        vec4(sin(theta),0.,cos(theta),0.),
        vec4(0.,0.,0.,1.));
}

mat4 RotateZ(float psi){
    return mat4(
        vec4(cos(psi),-sin(psi),0.,0),
        vec4(sin(psi),cos(psi),0.,0.),
        vec4(0.,0.,1.,0.),
        vec4(0.,0.,0.,1.));
}

mat4 eulerXYZToMat4(vec3 e) {
    vec3 c = cos(e);
    vec3 s = sin(e);

    float ae = c.x * c.z, af = c.x * s.z, be = s.x * c.z, bf = s.x * s.z;

    mat4 m = mat4(1.0);

    // XYZ
    m[0][0] = c.y * c.z;
    m[1][0] = -c.y * s.z;
    m[2][0] = s.y;

    m[0][1] = af + be * s.y;
    m[1][1] = ae - bf * s.y;
    m[2][1] = -s.x * c.y;

    m[0][2] = bf - ae * s.y;
    m[1][2] = be + af * s.y;
    m[2][2] = c.x * c.y;

    return m;
}

mat4 quaternionToMat4(vec4 q) {
    vec4 q2 = q + q;

    float xx = q.x * q2.x, xy = q.x * q2.y, xz = q.x * q2.z;
    float yy = q.y * q2.y, yz = q.y * q2.z, zz = q.z * q2.z;
    float wx = q.w * q2.x, wy = q.w * q2.y, wz = q.w * q2.z;

    return mat4(
        1.0 - (yy + zz),  xy + wz, xz - wy, 0.0,
        xy - wz, 1.0 - (xx + zz), yz + wx, 0.0,
        xz + wy, yz - wx, 1.0 - (xx + yy), 0.0,
        0.0, 0.0, 0.0, 1.0
    );
}

mat4 composeXYZMat4(vec3 offset, vec3 euler, vec3 scale) {
    mat4 m = eulerXYZToMat4(euler);

    // scale
    m[0] *= scale.x;
    m[1] *= scale.y;
    m[2] *= scale.z;

    // position
    m[3].xyz = offset;
    return m;
}

mat4 composeMat4(vec3 offset, vec4 orientation, vec3 scale) {
    mat4 m = quaternionToMat4(orientation);

    // scale
    m[0] *= scale.x;
    m[1] *= scale.y;
    m[2] *= scale.z;

    // position
    m[3].xyz = offset;
    return m;
}

mat3 getNormalMatrix(mat4 m) {
    return transpose(inverse(mat3(m)));
}
{@}PBR.glsl{@}#!ATTRIBUTES

#!UNIFORMS

#!VARYINGS

#!SHADER: Vertex

#require(pbr.vs)

void main() {
    vec3 pos = position;
    setupPBR(pos);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment

#require(pbr.fs)

void main() {
    gl_FragColor = getPBR();
}
{@}pbr.fs{@}uniform sampler2D tBaseColor;
uniform sampler2D tMRO;
uniform sampler2D tNormal;
uniform sampler2D tLUT;

uniform sampler2D tEnvDiffuse;
uniform sampler2D tEnvSpecular;
uniform vec2 uEnvOffset;

uniform sampler2D tLightmap;
uniform float uUseLightmap;
uniform float uLightmapIntensity;
uniform float uUseLinearOutput;

uniform vec3 uTint;
uniform vec2 uTiling;
uniform vec2 uOffset;
uniform vec4 uMRON;
uniform vec3 uEnv;

uniform float uHDR;

varying vec2 vUv;
varying vec2 vUv2;
varying vec3 vV;
varying vec3 vWorldNormal;

vec3 unpackNormalPBR( vec3 eye_pos, vec3 surf_norm, sampler2D normal_map, float intensity, float scale, vec2 uv ) {
    vec3 q0 = dFdx( eye_pos.xyz );
    vec3 q1 = dFdy( eye_pos.xyz );
    vec2 st0 = dFdx( uv.st );
    vec2 st1 = dFdy( uv.st );

    vec3 N = normalize(surf_norm);

    vec3 q1perp = cross( q1, N );
    vec3 q0perp = cross( N, q0 );

    vec3 T = q1perp * st0.x + q0perp * st1.x;
    vec3 B = q1perp * st0.y + q0perp * st1.y;

    float det = max( dot( T, T ), dot( B, B ) );
    float scalefactor = ( det == 0.0 ) ? 0.0 : inversesqrt( det );

    vec3 mapN = texture2D( normal_map, uv * scale ).xyz * 2.0 - 1.0;
    mapN.xy *= intensity;

    return normalize( T * ( mapN.x * scalefactor ) + B * ( mapN.y * scalefactor ) + N * mapN.z );
}

const vec2 INV_ATAN = vec2(0.1591, 0.3183);
const float LN2 = 0.6931472;
const float ENV_LODS = 7.0;
const float PI = 3.14159;

struct PBRConfig {
    float reflection;
    float clearcoat;
    vec3 color;
    vec3 lightColor;
    vec3 envReflection;
    bool overrideMRO;
    bool overrideENV;
    vec3 mro;
    vec3 env;
};

vec3 fresnelSphericalGaussianRoughness(float cosTheta, vec3 F0, float roughness) {
    return F0 + (max(vec3(1.0 - roughness), F0) - F0) * pow(2.0, (-5.55473 * cosTheta - 6.98316) * cosTheta);
}

vec2 sampleSphericalMap(vec3 v) {
    vec3 normalizedV = normalize(v);
    vec2 uv = vec2(0.5 + atan(normalizedV.z, normalizedV.x) / (2.0 * PI), 0.5 + asin(normalizedV.y) / PI);
    return uv;
}

vec4 SRGBtoLinear(vec4 srgb) {
    vec3 linOut = pow(srgb.xyz, vec3(2.2));
    return vec4(linOut, srgb.w);
}

vec3 linearToSRGB(vec3 color) {
    return pow(color, vec3(0.4545454545454545));
}

vec4 linearToSRGB(vec4 color) {
    return vec4(pow(color.rgb, vec3(0.4545454545454545)), 1.0);
}

vec4 RGBMToLinear(vec4 value) {
    float maxRange = 6.0;
    return vec4(value.xyz * value.w * maxRange, 1.0);
}

vec4 autoToLinear(vec4 texel, float uHDR) {
    vec4 color = RGBMToLinear(texel);
    if (uHDR < 0.001) { color = SRGBtoLinear(texel); }
    return color;
}

vec3 uncharted2Tonemap(vec3 x) {
    float A = 0.15;
    float B = 0.50;
    float C = 0.10;
    float D = 0.20;
    float E = 0.02;
    float F = 0.30;
    return ((x * (A * x + C * B) + D * E) / (x * (A * x + B) + D * F)) - E / F;
}

vec3 uncharted2(vec3 color) {
    const float W = 11.2;
    float exposureBias = 2.0;
    vec3 curr = uncharted2Tonemap(exposureBias * color);
    vec3 whiteScale = 1.0 / uncharted2Tonemap(vec3(W));
    return curr * whiteScale;
}

vec4 getIBLContribution(float NdV, vec4 baseColor, vec4 MRO, vec3 R, vec3 V, vec3 N, sampler2D tLUT, sampler2D tEnvDiffuse, sampler2D tEnvSpecular, PBRConfig config) {
    float metallic = clamp(MRO.x + uMRON.x - 1.0, 0.0, 1.0);
    float roughness = clamp(MRO.y + uMRON.y - 1.0, 0.0, 1.0);
    float ao = mix(1.0, MRO.z, uMRON.z);
    vec3 env = uEnv;

    if (config.overrideMRO) {
        metallic = config.mro.x;
        roughness = config.mro.y;
        ao = config.mro.z;
    }

    if (config.overrideENV) {
        env = config.env;
    }

    vec2 lutUV = vec2(NdV, roughness);
    vec2 diffuseUV = sampleSphericalMap(N);

    vec3 brdf = SRGBtoLinear(texture2D(tLUT, lutUV)).rgb;
    vec3 diffuse = autoToLinear( texture2D(tEnvDiffuse, diffuseUV + uEnvOffset ), uHDR).rgb;

    vec3 lightmap = vec3(1.0);

    if (uUseLightmap > 0.0) {
        lightmap = texture2D(tLightmap, vUv2).rgb;
        lightmap.rgb = pow(lightmap.rgb, vec3(2.2)) * uLightmapIntensity;
        diffuse.rgb *= lightmap.rgb;
    }

    diffuse *= baseColor.rgb;

    float level = floor(roughness * ENV_LODS);
    vec2 specUV = sampleSphericalMap(R);

    specUV.y /= 2.0;
    specUV /= pow(2.0, level);
    specUV.y += 1.0 - exp(-LN2 * level);

    vec3 specular = autoToLinear(texture2D(tEnvSpecular, specUV + uEnvOffset), uHDR).rgb;

    // fake stronger specular highlight
    specular += pow(specular, vec3(2.2)) * env.y;

    if (uUseLightmap > 0.0) {
        specular *= lightmap;
    }

    vec3 F0 = vec3(0.04);
    F0 = mix(F0, baseColor.rgb, metallic);

    vec3 F = fresnelSphericalGaussianRoughness(NdV, F0, roughness);

    vec3 diffuseContrib = 1.0 - F;
    specular = specular.rgb * (F * brdf.x + brdf.y);

    diffuseContrib *= 1.0 - metallic;

    float alpha = baseColor.a;

    return vec4((diffuseContrib * diffuse + specular + (config.envReflection*0.01)) * ao * env.x, alpha);
}

vec3 getNormal() {
    vec3 N = vWorldNormal;
    vec3 V = normalize(vV);
    return unpackNormalPBR(V, N, tNormal, uMRON.w, 1.0, vUv).xyz;
}

vec4 getPBR(vec3 baseColor, PBRConfig config) {
    vec3 N = vWorldNormal;
    vec3 V = normalize(vV);
    vec3 worldNormal = getNormal();
    vec3 R = reflect(V, worldNormal);
    float NdV = abs(dot(worldNormal, V));
    vec4 baseColor4 = SRGBtoLinear(vec4(baseColor, 1.0));

    vec4 MRO = texture2D(tMRO, vUv);
    vec4 color = getIBLContribution(NdV, baseColor4, MRO, R, V, worldNormal, tLUT, tEnvDiffuse, tEnvSpecular, config);

    if (uUseLinearOutput < 0.5) {
        color.rgb = uncharted2(color.rgb);
        color = linearToSRGB(color);
    }

    return color;
}

vec4 getPBR(vec3 baseColor) {
    PBRConfig config;
    return getPBR(baseColor, config);
}

vec4 getPBR() {
    vec4 baseColor = texture2D(tBaseColor, vUv);
    vec4 color = getPBR(baseColor.rgb * uTint);
    color.a *= baseColor.a;
    return color;
}
{@}pbr.vs{@}attribute vec2 uv2;

uniform sampler2D tBaseColor;
uniform vec2 uTiling;
uniform vec2 uOffset;

varying vec2 vUv;
varying vec2 vUv2;
varying vec3 vNormal;
varying vec3 vWorldNormal;
varying vec3 vV;

void setupPBR(vec3 p0) { //inlinemain
    vUv = uv * uTiling + uOffset;
    vUv2 = uv2;
    vec4 worldPos = modelMatrix * vec4(p0, 1.0);
    vV = worldPos.xyz - cameraPosition;
    vNormal = normalMatrix * normal;
    vWorldNormal = mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * normal;
}

void setupPBR(vec3 p0, vec3 n) {
    vUv = uv * uTiling + uOffset;
    vUv2 = uv2;
    vec4 worldPos = modelMatrix * vec4(p0, 1.0);
    vV = worldPos.xyz - cameraPosition;
    vNormal = normalMatrix * n;
    vWorldNormal = mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz) * n;
}
{@}radialblur.fs{@}vec3 radialBlur( sampler2D map, vec2 uv, float size, vec2 resolution, float quality ) {
    vec3 color = vec3(0.);

    const float pi2 = 3.141596 * 2.0;
    const float direction = 8.0;

    vec2 radius = size / resolution;
    float test = 1.0;

    for ( float d = 0.0; d < pi2 ; d += pi2 / direction ) {
        vec2 t = radius * vec2( cos(d), sin(d));
        for ( float i = 1.0; i <= 100.0; i += 1.0 ) {
            if (i >= quality) break;
            color += texture2D( map, uv + t * i / quality ).rgb ;
        }
    }

    return color / ( quality * direction);
}

vec3 radialBlur( sampler2D map, vec2 uv, float size, float quality ) {
    vec3 color = vec3(0.);

    const float pi2 = 3.141596 * 2.0;
    const float direction = 8.0;

    vec2 radius = size / vec2(1024.0);
    float test = 1.0;
    float samples = 0.0;

    for ( float d = 0.0; d < pi2 ; d += pi2 / direction ) {
        vec2 t = radius * vec2( cos(d), sin(d));
        for ( float i = 1.0; i <= 100.0; i += 1.0 ) {
            if (i >= quality) break;
            color += texture2D( map, uv + t * i / quality ).rgb ;
            samples += 1.0;
        }
    }

    return color / samples;
}
{@}range.glsl{@}

float range(float oldValue, float oldMin, float oldMax, float newMin, float newMax) {
    vec3 sub = vec3(oldValue, newMax, oldMax) - vec3(oldMin, newMin, oldMin);
    return sub.x * sub.y / sub.z + newMin;
}

vec2 range(vec2 oldValue, vec2 oldMin, vec2 oldMax, vec2 newMin, vec2 newMax) {
    vec2 oldRange = oldMax - oldMin;
    vec2 newRange = newMax - newMin;
    vec2 val = oldValue - oldMin;
    return val * newRange / oldRange + newMin;
}

vec3 range(vec3 oldValue, vec3 oldMin, vec3 oldMax, vec3 newMin, vec3 newMax) {
    vec3 oldRange = oldMax - oldMin;
    vec3 newRange = newMax - newMin;
    vec3 val = oldValue - oldMin;
    return val * newRange / oldRange + newMin;
}

float crange(float oldValue, float oldMin, float oldMax, float newMin, float newMax) {
    return clamp(range(oldValue, oldMin, oldMax, newMin, newMax), min(newMin, newMax), max(newMin, newMax));
}

vec2 crange(vec2 oldValue, vec2 oldMin, vec2 oldMax, vec2 newMin, vec2 newMax) {
    return clamp(range(oldValue, oldMin, oldMax, newMin, newMax), min(newMin, newMax), max(newMin, newMax));
}

vec3 crange(vec3 oldValue, vec3 oldMin, vec3 oldMax, vec3 newMin, vec3 newMax) {
    return clamp(range(oldValue, oldMin, oldMax, newMin, newMax), min(newMin, newMax), max(newMin, newMax));
}

float rangeTransition(float t, float x, float padding) {
    float transition = crange(t, 0.0, 1.0, -padding, 1.0 + padding);
    return crange(x, transition - padding, transition + padding, 1.0, 0.0);
}
{@}rotation.glsl{@}mat4 rotationMatrix(vec3 axis, float angle) {
    axis = normalize(axis);
    float s = sin(angle);
    float c = cos(angle);
    float oc = 1.0 - c;

    return mat4(oc * axis.x * axis.x + c,           oc * axis.x * axis.y - axis.z * s,  oc * axis.z * axis.x + axis.y * s,  0.0,
                oc * axis.x * axis.y + axis.z * s,  oc * axis.y * axis.y + c,           oc * axis.y * axis.z - axis.x * s,  0.0,
                oc * axis.z * axis.x - axis.y * s,  oc * axis.y * axis.z + axis.x * s,  oc * axis.z * axis.z + c,           0.0,
                0.0,                                0.0,                                0.0,                                1.0);
}


mat2 rotationMatrix(float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return mat2(c, -s, s, c);
}{@}roundedBorder.glsl{@}float roundedBorder(float thickness, float radius, vec2 uv, vec2 resolution, out float inside) {
    // Get square-pixel coordinates in range -1.0 .. 1.0
    float multiplier = max(resolution.x, resolution.y);
    vec2 ratio = resolution / multiplier;
    vec2 squareUv = (2.0 * uv - 1.0) * ratio; // -1.0 .. 1.0

    float squareThickness = (thickness / multiplier);
    float squareRadius = 2.0 * (radius / multiplier);
    vec2 size = ratio - vec2(squareRadius + squareThickness);


    vec2 q = abs(squareUv) - size;
    float d = min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - squareRadius;
    float dist = abs(d);
    float delta = fwidth(dist);
    float border = 1.0 - smoothstep(-delta, delta, dist - squareThickness);

    delta = fwidth(d);
    float limit = squareThickness * 0.5;
    inside = 1.0 - smoothstep(-delta, delta, d - limit);

    return border;
}

float roundedBorder(float thickness, float radius, vec2 uv, vec2 resolution) {
    float inside;
    return roundedBorder(thickness, radius, uv, resolution, inside);
}
{@}simplenoise.glsl{@}float getNoise(vec2 uv, float time) {
    float x = uv.x * uv.y * time * 1000.0;
    x = mod(x, 13.0) * mod(x, 123.0);
    float dx = mod(x, 0.01);
    float amount = clamp(0.1 + dx * 100.0, 0.0, 1.0);
    return amount;
}

#test Device.mobile
float sinf(float x) {
    x*=0.159155;
    x-=floor(x);
    float xx=x*x;
    float y=-6.87897;
    y=y*xx+33.7755;
    y=y*xx-72.5257;
    y=y*xx+80.5874;
    y=y*xx-41.2408;
    y=y*xx+6.28077;
    return x*y;
}
#endtest

#test !Device.mobile
    #define sinf sin
#endtest

highp float getRandom(vec2 co) {
    highp float a = 12.9898;
    highp float b = 78.233;
    highp float c = 43758.5453;
    highp float dt = dot(co.xy, vec2(a, b));
    highp float sn = mod(dt, 3.14);
    return fract(sin(sn) * c);
}

float cnoise(vec3 v) {
    float t = v.z * 0.3;
    v.y *= 0.8;
    float noise = 0.0;
    float s = 0.5;
    noise += (sinf(v.x * 0.9 / s + t * 10.0) + sinf(v.x * 2.4 / s + t * 15.0) + sinf(v.x * -3.5 / s + t * 4.0) + sinf(v.x * -2.5 / s + t * 7.1)) * 0.3;
    noise += (sinf(v.y * -0.3 / s + t * 18.0) + sinf(v.y * 1.6 / s + t * 18.0) + sinf(v.y * 2.6 / s + t * 8.0) + sinf(v.y * -2.6 / s + t * 4.5)) * 0.3;
    return noise;
}

float cnoise(vec2 v) {
    float t = v.x * 0.3;
    v.y *= 0.8;
    float noise = 0.0;
    float s = 0.5;
    noise += (sinf(v.x * 0.9 / s + t * 10.0) + sinf(v.x * 2.4 / s + t * 15.0) + sinf(v.x * -3.5 / s + t * 4.0) + sinf(v.x * -2.5 / s + t * 7.1)) * 0.3;
    noise += (sinf(v.y * -0.3 / s + t * 18.0) + sinf(v.y * 1.6 / s + t * 18.0) + sinf(v.y * 2.6 / s + t * 8.0) + sinf(v.y * -2.6 / s + t * 4.5)) * 0.3;
    return noise;
}

float fbm(vec3 x, int octaves) {
    float v = 0.0;
    float a = 0.5;
    vec3 shift = vec3(100);

    for (int i = 0; i < 10; ++i) {
        if (i >= octaves){ break; }

        v += a * cnoise(x);
        x = x * 2.0 + shift;
        a *= 0.5;
    }

    return v;
}

float fbm(vec2 x, int octaves) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.50));

    for (int i = 0; i < 10; ++i) {
        if (i >= octaves){ break; }

        v += a * cnoise(x);
        x = rot * x * 2.0 + shift;
        a *= 0.5;
    }

    return v;
}
{@}transformUV.glsl{@}vec2 translateUV(vec2 uv, vec2 translate) {
    return uv - translate;
}

vec2 rotateUV(vec2 uv, float r, vec2 origin) {
    float c = cos(r);
    float s = sin(r);
    mat2 m = mat2(c, -s,
                  s, c);
    vec2 st = uv - origin;
    st = m * st;
    return st + origin;
}

vec2 scaleUV(vec2 uv, vec2 scale, vec2 origin) {
    vec2 st = uv - origin;
    st /= scale;
    return st + origin;
}

vec2 rotateUV(vec2 uv, float r) {
    return rotateUV(uv, r, vec2(0.5));
}

vec2 scaleUV(vec2 uv, vec2 scale) {
    return scaleUV(uv, scale, vec2(0.5));
}

vec2 skewUV(vec2 st, vec2 skew) {
    return st + st.gr * skew;
}

vec2 transformUV(vec2 uv, float a[9]) {

    // Array consists of the following
    // 0 translate.x
    // 1 translate.y
    // 2 skew.x
    // 3 skew.y
    // 4 rotate
    // 5 scale.x
    // 6 scale.y
    // 7 origin.x
    // 8 origin.y

    vec2 st = uv;

    //Translate
    st -= vec2(a[0], a[1]);

    //Skew
    st = st + st.gr * vec2(a[2], a[3]);

    //Rotate
    st = rotateUV(st, a[4], vec2(a[7], a[8]));

    //Scale
    st = scaleUV(st, vec2(a[5], a[6]), vec2(a[7], a[8]));

    return st;
}{@}tridither.glsl{@}//https://www.shadertoy.com/view/4djSRW
float hash12(vec2 p)
{
    vec3 p3  = fract(vec3(p.xyx) * .1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

vec3 hash32(vec2 p)
{
    vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973));
    p3 += dot(p3, p3.yxz+33.33);
    return fract((p3.xxy+p3.yzz)*p3.zyx);
}

vec4 hash42(vec2 p)
{
    vec4 p4 = fract(vec4(p.xyxy) * vec4(.1031, .1030, .0973, .1099));
    p4 += dot(p4, p4.wzxy+33.33);
    return fract((p4.xxyz+p4.yzzw)*p4.zywx);

}

float dither1(in float color, in vec2 coord, in float time) {
    float noiseA = hash12(coord + fract(time + 1781.0));
    float noiseB = hash12(coord + fract(time + 1130.0));
    return color + ((noiseA + (noiseB - 1.0)) / 255.0);
}

vec3 dither3(in vec3 color, in vec2 coord, in float time) {
    vec2 seed = coord;
    vec3 noiseA = hash32(seed + fract(time) * 1300.0);
    vec3 noiseB = hash32(seed.yx + fract(time) * 1854.0);
    return color + ((noiseA + (noiseB - 1.0)) / 255.0);
}

vec4 dither4(in vec4 color, in vec2 coord, in float time) {
    vec2 seed = coord;
    vec4 noiseA = hash42(seed + fract(time + 1015.0));
    vec4 noiseB = hash42(seed + fract(time + 1543.0));
    return color + ((noiseA + (noiseB - 1.0)) / 255.0);
}
{@}module.json{@}{
  "gl": ["transformUV"]
}{@}uvgrid.glsl{@}#require(transformUV.glsl)

vec2 getUVForGrid(vec2 uv, float xr, float yr, float x, float y) {
    return translateUV(scaleUV(uv, vec2(xr, yr), vec2(0.0)), -vec2(x / xr, y / yr));
}
{@}BubbleShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tPos;
uniform sampler2D tMap;
uniform sampler2D tMapPop;
uniform float uDPR;

#!VARYINGS

#!SHADER: Vertex

void main() {
    vec3 pos = texture2D(tPos, position.xy).xyz;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    gl_PointSize = (0.02 * uDPR) * (1000.0 / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;
}


#!SHADER: Fragment
#require(transformUV.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    vec3 color = texture2D(tMap, gl_PointCoord.xy).rgb;
    color.b = texture2D(tMapPop, gl_PointCoord.xy).r;
    gl_FragColor = vec4(color, 1.);
}{@}AnimatedText2.glsl{@}#!ATTRIBUTES
attribute vec3 animation;

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tNoise;
uniform sampler2D tFluidMask;
uniform sampler2D tBubbles;

uniform vec3 uColor;
uniform float uAlpha;
uniform float uTransition;
uniform float uDirectionMask;
uniform float uDirection;
uniform float uArrowOffset;
uniform vec2 uStageResolution;

#!VARYINGS
// varying float vAnim;
// varying float vPos;
varying vec2 vUv;

#!SHADER: Vertex.vs
#require(eases.glsl)
#require(matrix.glsl)

void main() {
    vUv = uv;
    vec3 pos = position;
    // pos.y -= 290. + animation.x * 290. * (1. - uTransition);
    // pos.y += 290. * cubicIn(uTransition);
    // vPos = pos.y;
    // vAnim = animation.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
#require(msdf.glsl)
#require(transformUV.glsl)
#require(simplenoise.glsl)
#require(range.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    float wave = crange(cnoise(vec2((time*0.5+ st.y))), -2., 2., -0.2, 0.);
    vec2 uvG = rotateUV(st, uDirection > 0.5 ? 3.14 : 0.);
    vec2 uvR = rotateUV(uvG, uDirectionMask > 0.5 ? 3.14 : 0.);
    float mask = mix(1., 0., smoothstep(0., 0.003, (uTransition) - (uvR.x)  + st.y * 0.05 + wave));

    vec3 fluidMask = texture2D(tFluidMask, st).rgb;
    vec3 noise = texture2D(tNoise, st).rgb;

    vec4 bubblesT = texture2D(tBubbles, st);
    float bubbles = (bubblesT.g - bubblesT.r) * 0.5;
    float bubblesPops = bubblesT.b;

    float alpha = msdf(tMap, vUv);

    float fluidMaskHardEdge = smoothstep(0.97, 1., fluidMask.g);
    float fluidMaskHardEdgeB = smoothstep(0.97, 1., fluidMask.r);
    float fluidMaskHardEdgeS1 = smoothstep(0.28, .3, fluidMask.g);
    float fluidMaskHardEdgeS2 = smoothstep(0.19, .2, fluidMask.g);

    gl_FragColor.rgb = uColor * (1. - fluidMaskHardEdge);
    gl_FragColor.rgb += (uColor * 0.2 + bubbles)  * (fluidMaskHardEdgeS1);
    gl_FragColor.rgb += (uColor * 0.4 + bubbles)  * (fluidMaskHardEdgeS2);
    gl_FragColor.rgb += (uColor * 0.6 + bubbles)  * (fluidMaskHardEdge);
    gl_FragColor.rgb += (uColor * 0.9 + bubbles)  * (fluidMaskHardEdgeB);

    gl_FragColor.a = alpha;

    vec2 stageUV = gl_FragCoord.xy / resolution.xy;

    float offset = uArrowOffset - 20.0;

    float offetLeft = 0.5 - (offset / uStageResolution.x);
    float offetRight = 0.5 + (offset / uStageResolution.x);

    float left = step(offetLeft, stageUV.x);
    float right = 1.0 - step(offetRight, stageUV.x);

    float m = min(left, right);

    gl_FragColor.a *= m;
    

}
{@}CarouselBackgroundShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tPattern;
uniform sampler2D tNoise;
uniform sampler2D tTransition;

uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;

uniform vec3 uNextColor;
uniform vec3 uNextColor2;
uniform vec3 uNextColor3;
uniform vec3 uNextColor4;

uniform float uPatternIndex;
uniform float uNextPatternIndex;

uniform float uTile;
uniform float uLiquidTransition;
uniform float uLiquidDirection;

uniform float uIndex;
uniform float uNextIndex;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vec3 pos = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment
#require(spritesheetUV.glsl)
#require(simplenoise.glsl)
#require(range.glsl)

#define PI 3.14159265359

float getNoise(vec2 uv) {
    return texture2D(tNoise, uv).r;
}

float aastep(float threshold, float value) {
    float signedDist = threshold - value;
    float d = fwidth(signedDist);
    return 1.0 - smoothstep(-d, d, signedDist);
}

float getPattern1(vec2 uv) {
    // return smoothstep(0.5, 0.51, fract(uv.x * uTile)) * smoothstep(0.5, .51, fract(uv.y * uTile))
    //         + smoothstep(0.51, .5, fract(uv.x * uTile)) * smoothstep(0.51, .5, fract(uv.y * uTile));
    vec2 patternUv = uv * 2.0 - 1.0;
    patternUv *= (resolution.xy / min(resolution.x, resolution.y));
    return texture2D(tPattern, patternUv * uTile + time * 0.01 + cnoise(patternUv) * .03).g;
}

float getPattern2(vec2 uv) {
    vec2 patternUv = rotateUV(uv, length(uv - .5) + time * 0.1);
    patternUv = patternUv - .5;
    return smoothstep(.52, .5, fract(atan(patternUv.y, patternUv.x) * 1.4)) + smoothstep(.9, .92, fract(atan(patternUv.y, patternUv.x) * 1.4));
}

float getPattern3(vec2 uv) {
    vec2 patternUv = uv;
    patternUv = patternUv - .5;
    float curve = crange(getNoise(uv * 2.3), 0., 1., -1., 1.) * length(uv - .5);
    curve += getNoise(vec2(crange(atan(patternUv.y, patternUv.x), -3.14, 3.14, 0., 1.) * 3.)) * 2.1 - 1.;

    return smoothstep(.5 + curve, .52 + curve, fract(length(patternUv * 7.) - time * 0.08) + curve * 0.6) + smoothstep(.18 + curve, 0.16 + curve, fract(length(patternUv * 7.) - time * 0.08) + curve * 0.6);
}


float getPattern4(vec2 uv) {
    vec2 patternUv = uv / 5.;
    float value = fbm(vec3(rotateUV(patternUv, length(uv - .5) - time * 0.01) * 7., fract(length(patternUv)) * 0.02), 5);
    float v2 = aastep(0.1, value);
    float v3 = aastep(0.2, value);
    return 1. - max(v2 - v3, 0.);

    //ALT
    // vec2 patternUv = uv;
    // patternUv.y = getNoise(uv / 2.);
    // patternUv.x = getNoise(uv / 2.);
    // patternUv = patternUv - .5;
    // float curve = getNoise(patternUv) / 4.;
    // return smoothstep(.3 + curve, .31 + curve, fract(length(patternUv * 7.) - time * 0.08) + curve * 0.6) + smoothstep(.18 + curve, 0.16 + curve, fract(length(patternUv * 7.) - time * 0.08) + curve * 0.6);
}


void main() {
    vec2 uv = gl_FragCoord.xy / resolution;

    float pattern = 1.;

    float indexLeft  = floor(mod(uIndex, 4.));
    float indexRight = ceil(mod(uIndex, 4.));

    float wave    = crange(cnoise(vec2((time*0.5+ uv.y))), -2., 2., -0.2, 0.);
    float stepped = step(crange(fract(uIndex),0.,1., -0.2, 1.4), uv.x - (uv.y * 0.05) - wave);

    vec2 spriteUV         = spritesheetUV(uv, uLiquidTransition, 16., 16., 0.);
    vec2 spriteUVReversed = spriteUV;

    spriteUVReversed = rotateUV(spriteUVReversed, -PI);

          spriteUV = mix(spriteUV, spriteUVReversed, uLiquidDirection);
    float maskCol  = smoothstep(0.48, 0.5, texture2D(tTransition, spriteUV)).r;

    float dir = mix(maskCol, maskCol, uLiquidDirection);

    float patternDir = dir;

    if(uPatternIndex == 0.0) {

        float patternA = getPattern1(uv);
        float patternB = getPattern2(uv);
        float patternC = getPattern4(uv);

        // use liquid direction to determine which patterns to mix betweeen
        // example, if arriving to index 0 from the left, mix between patternA and patternC

        pattern = mix(patternA, mix( patternB, patternC, patternDir * uLiquidDirection), patternDir);
    }

    if(uPatternIndex == 1.0) {

        float patternA = getPattern2(uv);
        float patternB = getPattern1(uv);
        float patternC = getPattern3(uv);

        pattern = mix(patternA, mix( patternB, patternC, 1.0 - uLiquidDirection), patternDir);

    }

    if(uPatternIndex == 2.0) {

        float patternA = getPattern3(uv);
        float patternB = getPattern2(uv);
        float patternC = getPattern4(uv);

        pattern = mix(patternA, mix(patternB, patternC, 1.0 - uLiquidDirection), patternDir);

    }

    if(uPatternIndex == 3.0) {

        float patternA = getPattern4(uv);
        float patternB = getPattern3(uv);
        float patternC = getPattern1(uv);

        pattern = mix(patternA, mix(patternB, patternC, 1.0 - uLiquidDirection), patternDir);
    }

    vec3 colorA = mix(uColor, uNextColor, dir);
    vec3 colorB = mix(uColor2, uNextColor2, dir);
    vec3 color  = mix(colorA, colorB, 1.0 - pattern);

    gl_FragColor = vec4(color, 1.0);

}
{@}CarouselFruitPBR.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uLightColor;
uniform float uAlpha;

#!VARYINGS

#!SHADER: Vertex
#require(pbr.vs)

void main() {
    vec3 pos = position;
    setupPBR(pos);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos * uAlpha, 1.0);
}

#!SHADER: Fragment
#require(pbr.fs)

void main() {
    vec4 pbr = getPBR();
    vec4 color = linearToSRGB(pbr);

    gl_FragColor = color;
}
{@}CloseButtonShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    float alpha = smoothstep(0.5, 0.45, length(vUv-.5));
    vec3 color = mix(uColor2, uColor, smoothstep(0., 1., texture2D(tMap, vUv * 1.5 - 0.26).r)); 

    gl_FragColor = vec4(color, alpha);
}{@}DrinksCarouselPass.fs{@}uniform sampler2D tBubbles;
uniform sampler2D tFluidMask;
uniform sampler2D tNoise;

#require(eases.glsl)
#require(range.glsl)
#require(transformUV.glsl)

void main() {
    vec2 uv = vUv;
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 noise = texture2D(tNoise, st).rgb;

    vec3 fluidMask = texture2D(tFluidMask, vUv).rgb;
    uv = scaleUV(uv, vec2(1. + (fluidMask.b) * 0.2 * smoothstep(0.35, 0.2, length(vUv-.5))));

    float ratio = resolution.x / resolution.y;

    vec2 dir = (vUv - vec2(0.5)) / vec2(1., ratio);
    float dist = length(dir);
    float ripple = sin(40.0 * (time * 0.3 - dist));

    uv += dir * ripple * 0.04 * smoothstep(0., 0.4, fluidMask.g);

    vec4 bubblesT = texture2D(tBubbles, vUv);
    float bubbles = (bubblesT.g - bubblesT.r) * 0.5;

    float maskColor = 1. - texture2D(tDiffuse, uv).b;

    vec4 color = texture2D(tDiffuse, uv);
    vec4 colorNoised = texture2D(tDiffuse, uv);

    color += color * bubbles * maskColor;
    color += bubbles * (1. - maskColor);

    // color.rgb = mix(1. - color.rgb, color.rgb, 1. - smoothstep(0.9,1., fluidMask.g));
    color.rgb = mix( mix(color.rgb + vec3(0.1) * 0.8, color.rgb, noise.g * 0.4), color.rgb, 1. - fluidMask.g);

    gl_FragColor = color;
}
{@}SimpleMaskShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    float alpha = smoothstep(0., 1., texture2D(tMap, vUv).r);
    gl_FragColor = vec4(uColor, uAlpha * alpha);
}{@}SimpleWipeTransitionShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec3 uNextColor;
uniform vec3 uNextColor2;
uniform float uTransition;
uniform float uLiquidTransition;
uniform float uLiquidDirection;
uniform sampler2D tTransition;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
#require(simplenoise.glsl)
#require(range.glsl)
#require(spritesheetUV.glsl)

#define PI 3.14159265359

void main() {

    vec2 st = gl_FragCoord.xy / resolution;

    vec2 spriteUV         = spritesheetUV(st, uLiquidTransition, 16., 16., 0.);
    vec2 spriteUVReversed = spriteUV;

    spriteUVReversed = rotateUV(spriteUVReversed, -PI);

          spriteUV = mix(spriteUV, spriteUVReversed, uLiquidDirection);
    float mask  = smoothstep(0.48, 0.5, texture2D(tTransition, spriteUV)).r;

    float dir = mix(mask, mask, uLiquidDirection);

    vec3 color = mix(uColor, uNextColor, dir);

    gl_FragColor = vec4(color, 1.0);
}{@}AnimatedText.glsl{@}#!ATTRIBUTES
attribute vec3 animation;

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tFluidMask;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTransition;
uniform sampler2D tBubbles;

#!VARYINGS
varying float vAnim;
varying vec2 vUv;

#!SHADER: Vertex.vs
#require(eases.glsl)
void main() {
    vUv = uv;
    vec3 pos = position;
    pos.y -= 240. + animation.x * 100. * (1. - uTransition);
    pos.y += 240. * uTransition + cubicOut(1.0 - uTransition) * 0.04;
    vAnim = pos.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
#require(msdf.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    float alpha = strokemsdf(tMap, vUv, 0.12, 0.14);
    float alphaBody = msdf(tMap, vUv);
    vec4 bubblesT = texture2D(tBubbles, st);
    float bubbles = (bubblesT.g - bubblesT.r * 0.5) ;

    if (vAnim < -200.) {
        discard;
    }

    vec3 fluidMask = texture2D(tFluidMask, st).rgb;

    gl_FragColor.rgb = uColor;
    gl_FragColor.a = mix(alpha, alphaBody - bubbles, smoothstep(0.99, 1., fluidMask.g));
}
{@}ArmShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = texture2D(tMap, vUv);
    gl_FragColor.rgb /= gl_FragColor.a;
}{@}ButtonShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uColor;
uniform float uBorderRadius;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    vUv = uv;
}

#!SHADER: Fragment
float sdRoundedBox(vec2 p, vec2 b, vec4 r) {
    vec2 q = abs(p)-b+r.x;
    return min(max(q.x,q.y),0.0) + length(max(q,0.0)) - r.x;
}
void main() {
    vec2 normalizedUv = vUv * 2.0 - 1.0;
    float aspect = 4.; // uResolution.x / uResolution.y;
    normalizedUv.x *= aspect;
    
    float d = sdRoundedBox(normalizedUv, vec2(aspect-0.03, 0.96), vec4(uBorderRadius));

    float aaf = fwidth(d);
    float radius = 0.01;
    float alpha = 1. - smoothstep(radius - aaf, radius, d);
    gl_FragColor = vec4(uColor, alpha * uAlpha);
}
{@}CheersFX.fs{@}uniform sampler2D tBubbles;
uniform sampler2D tFluidMask;
uniform sampler2D tSideText;
uniform vec3 uColor;

#require(transformUV.glsl)

void main() {
    vec2 uv = vUv;
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 fluidMask = texture2D(tFluidMask, vUv).rgb;
    uv = scaleUV(uv, vec2(1. +  (fluidMask.b * 0.2 * vUv.y)));

    vec4 bubblesT = texture2D(tBubbles, vUv);
    float bubbles = (bubblesT.g - bubblesT.r) * 0.5;
    float bubblesPops = bubblesT.b;


    vec3 color = texture2D(tDiffuse, uv).rgb;

    color += smoothstep(0.9, 1., fluidMask.g) * 0.1
    + (bubbles * smoothstep(0.9, 1., fluidMask.g))
    + bubblesPops * smoothstep(0., 1., ( fluidMask.r - fluidMask.b));

    vec3 sideTextColor = uColor;
    color.rgb = mix(color.rgb, sideTextColor, texture2D(tSideText, vUv).r);

    gl_FragColor = vec4(color , 1.0);
}
{@}ConfettiShader.glsl{@}#!ATTRIBUTES
attribute vec3 lookup;
attribute vec4 random;

#!UNIFORMS
uniform sampler2D tPos;
uniform sampler2D tLife;
uniform float uDPR;
uniform float uAlpha;
uniform sampler2D tMap;

#!VARYINGS
varying float vLife;
varying vec4 vRandom;

#!SHADER: Vertex
#require(range.glsl)
void main() {
    vec3 pos = texture2D(tPos, position.xy).xyz;
    vRandom = random;
    vLife = texture2D(tLife, position.xy).x;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);

    float size = 0.5;
    if (random.z > 0.2) size *= random.z;
    size *= vLife * smoothstep(0., 0.05, (1. - vLife));

    gl_PointSize = size * uDPR * (1000.0 / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;
}

#!SHADER: Fragment
#require(transformUV.glsl)

void main() {
    vec2 uv = gl_PointCoord.xy;
    float index = floor(mod(vRandom.y * 10., 3.));
    if (index == 2.0) {
        uv = rotateUV(uv, time + vRandom.z);
    }
    uv.x += 1.09 * index;
    uv.x /= 3.0;
    vec4 color = texture2D(tMap, uv);
    if ( color.a < 0.1 ) discard;
    
    color.a *= smoothstep(0., 0.03, 1. - vLife - vRandom.z * 0.4);
    color.a *= (vLife + 0.2);

    gl_FragColor = color;
}{@}AnimatedTextGoodTimes.glsl{@}#!ATTRIBUTES
attribute vec3 animation;

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tFluidMask;
uniform sampler2D tLiquid;

uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uAlpha;
uniform float uTransition;
uniform float uTransitionBg;

#!VARYINGS
varying float vAnim;
varying float vPos;
varying vec2 vUv;

#!SHADER: Vertex.vs
#require(eases.glsl)
#require(matrix.glsl)

void main() {
    vUv = uv;
    vec3 pos = position;
    pos.y -= 240. + animation.x * 200. * (1. - uTransition);
    pos.y += 240. * uTransition;
    vPos = pos.y;
    vAnim = animation.x;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
#require(msdf.glsl)
#require(transformUV.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    vec3 liquid = texture2D(tLiquid, st).rgb;
    float dist = (1. - distance(st, vec2(0.5)) * 0.5) * uTransitionBg;

    liquid.r = smoothstep(1. - (liquid.r + liquid.b) - dist, 0.5, 1.);

    vec3 fluidMask = texture2D(tFluidMask, st).rgb;
    float alpha = msdf(tMap, vUv);
    gl_FragColor.rgb = mix(uColor2 , uColor,liquid.r );

    gl_FragColor.a = alpha * uTransition;
}
{@}GoodTimesPass.fs{@}uniform vec4 uMiddle;
uniform vec4 uDistortion;
uniform sampler2D tBubbles;
uniform sampler2D tLiquid;
uniform sampler2D tFluidMask;
uniform sampler2D tNoise;
uniform sampler2D tSideText;

#require(eases.glsl)
#require(range.glsl)
#require(transformUV.glsl)

void main() {
    vec2 uv = vUv;
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 noise = texture2D(tNoise, st).rgb;

    vec3 fluidMask = texture2D(tFluidMask, vUv).rgb;
    uv = scaleUV(uv, vec2(1. +  (fluidMask.b * 0.8)));

    float center = range(sin(time * uMiddle.x + uv.x * uMiddle.y), -1.0, 1.0, uMiddle.z, 1.0 - uMiddle.z);
    float strength = crange(uv.y, 0.0, center, 0.0, 1.0) * crange(uv.y, center, 1.0, 1.0, 0.0);
    strength = sineInOut(strength);
    vec2 offset = vec2(sin(time * uDistortion.x + uDistortion.y), sin(time * uDistortion.x + uDistortion.z)) * uDistortion.w;
    offset *= vec2(strength + uMiddle.w, strength + 0.1);

    uv += offset * 0.3;
    vec3 liquid = texture2D(tLiquid, vUv).rgb;
    vec4 bubblesT = texture2D(tBubbles, vUv);
    vec4 bubblesInverseT = texture2D(tBubbles, rotateUV(st, 3.14));
    float bubbles = (bubblesT.g - bubblesT.r * 0.5) * 0.5;
    float bubblesInverse = (bubblesInverseT.g - bubblesInverseT.r * 0.5) * 0.5;
    float bubblesPops = bubblesT.b;

    liquid.r = smoothstep(1. - liquid.r, 0.5, 1.);

    float maskColor = 1. - texture2D(tDiffuse, uv).b;

    vec4 color = texture2D(tDiffuse, scaleUV(uv, vec2(1. + (liquid.b * 0.1))));
    vec4 colorNoised = texture2D(tDiffuse, uv);

    color += color * bubbles * maskColor * 0.4;
    color += bubbles * (1. - maskColor) * 0.4;

    color += bubblesInverse * (liquid.b * st.y * 0.5);

    //color.rgb = mix(1. - color.rgb, color.rgb, 1. - smoothstep(0.9,1., fluidMask.g));
    color.rgb = mix( mix(color.rgb + vec3(1., 1., 1.) * 0.06, color.rgb, noise.g * 0.4), color.rgb, 1. - fluidMask.g);

    color += smoothstep(0.9, 1., fluidMask.g) * 0.06
    + (bubbles * smoothstep(0.9, 1., fluidMask.g))
    + bubblesPops * smoothstep(0., 1., ( fluidMask.r - fluidMask.b));

    vec3 sideTextColor = vec3(1., 0.027, 0.21);
    if (maskColor > 0.) {
        sideTextColor = vec3(1., 0.756, 1.);
    }

    color.rgb = mix(color.rgb, sideTextColor, texture2D(tSideText, vUv).r);

    gl_FragColor = color;
}
{@}ConfettiShader2.glsl{@}#!ATTRIBUTES
attribute vec3 lookup;
attribute vec4 random;

#!UNIFORMS
uniform sampler2D tPos;
uniform sampler2D tLife;
uniform float uDPR;
uniform float uAlpha;
uniform vec3 uColor;

#!VARYINGS
varying float vLife;
varying vec3 vNormal;
varying vec4 vRandom;

#!SHADER: Vertex
#require(range.glsl)
#require(instance.vs)
#require(rotation.glsl)
void main() {
    vLife = texture2D(tLife, lookup.xy).x;

    vec3 offset = texture2D(tPos, lookup.xy).xyz;
    float scale = (random.z + vLife);
    vec3 rotated = vec3(rotationMatrix(vec3(random.z, random.x, random.y), radians(360.0 * time * random.w)) * vec4(position, 1.0));

    vec3 pos = transformPosition(rotated, offset, scale);
    vec3 n = normal;
    vNormal = normalize(normalMatrix * normal);
    vRandom = random;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_Position = projectionMatrix * mvPosition;
}

#!SHADER: Fragment
#require(transformUV.glsl)

void main() {
    vec2 uv = gl_PointCoord.xy;
    vec4 color = vec4(uColor, 1.);
    
    color.a *= smoothstep(0., 0.03, 1. - vLife - vRandom.z * 0.4);
    color.a *= (vLife + 0.2);

    gl_FragColor = color;
}{@}Landing.fs{@}uniform sampler2D tBubbles;
uniform sampler2D tFoam;
uniform sampler2D tLiquid;
uniform sampler2D tNoise;
uniform float uTime;
uniform float uInitialAnimation;
uniform sampler2D tFluidMask;
uniform vec3 uInitialColor;

#require(spritesheetUV.glsl)

#define PI 3.14159265359

#require(conditionals.glsl)

void main() {
    vec2 uv = vUv;
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 noise = texture2D(tNoise, st).rgb;

    vec3 fluidMask = texture2D(tFluidMask, vUv).rgb;

    vec4 bubblesInverseT = texture2D(tBubbles, rotateUV(st, 3.14));
    vec4 bubblesT = texture2D(tBubbles, st);
    float bubbles = (bubblesT.g - bubblesT.r) * 0.5;
    float bubblesInverse = (bubblesInverseT.g - bubblesInverseT.r) * 0.4;
    float bubblesPops = bubblesT.b;


    // correct aspect ratio for foam
    vec2 foamUV = st;
    float foamResY = mix(1.0, 1.75, when_gt(resolution.x, resolution.y));
    float foamResX = mix(1.0, 1.75, when_lt(resolution.x, resolution.y));
    foamUV = scaleUV(foamUV, vec2(foamResX, foamResY));

    float transitionFoam = texture2D(tFoam, spritesheetUV(foamUV, uTime, 16., 16., 0.)).r;
    
    vec3 liquid = texture2D(tLiquid, vUv).rgb;

    liquid.r = smoothstep(1. - liquid.r, 0.9, 1.);

    vec3 color = (liquid.r * uInitialColor) + (bubblesInverse) * liquid.r;

    float dist = distance(st, vec2(0.5));

    color += texture2D(tDiffuse, scaleUV(uv, vec2(mix(1. + noise.b * 0.05, 1., uInitialAnimation)))).rgb * (1. - liquid.r);

    color += bubblesPops * (liquid.b - liquid.r);

    color = mix(uInitialColor, color, smoothstep(transitionFoam, 0.2, 1.));

    color += (noise.b * dist) * min(fluidMask.g, 0.15) * 2.;

    gl_FragColor = vec4(color , 1.0);
}
{@}PopShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uTime;
uniform vec3 uColor;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment

#require(spritesheetUV.glsl)

void main() {
    float alpha = uTime > 0. ? 1. - smoothstep(texture2D(tMap, spritesheetUV(vUv, uTime, 8., 8., 0.)).b, 0.2, 1.) : 0.;
    gl_FragColor = vec4(uColor, alpha);
}{@}StickerShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uTime;


#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
#require(spritesheetUV.glsl)
void main() {
    vec2 st = spritesheetUV(vUv, uTime, 8., 8., 0.);
    gl_FragColor = texture2D(tMap, st);
    gl_FragColor.rgb /= gl_FragColor.a;
}{@}TextLanding.glsl{@}#!ATTRIBUTES
attribute vec3 animation;

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tFluidMask;
uniform sampler2D tBubbles;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uTransitionA;
uniform float uTransitionB;
uniform float uLetterCount;

#!VARYINGS
varying vec2 vUv;
varying float vMask;

varying float vAnimation;

#!SHADER: Vertex.vs
#require(range.glsl)
void main() {
    vUv = uv;
    vec3 pos = position;

    float letterIn = (animation.x + 1.0) / uLetterCount;

    float letterTrans = 1.0 - rangeTransition(uTransitionA, letterIn, 1.4);
    pos.y -= letterTrans * 1.2;
    pos.y += 0.3 * uTransitionA;

    float letterOut = (animation.x + 1.0) / uLetterCount;
    float letterTransOut = rangeTransition(uTransitionB, letterOut, 1.2);
    pos.y -= letterTransOut * 0.3;

    vMask = pos.y;
    vAnimation = letterTrans;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
#require(msdf.glsl)
#require(range.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    vec3 fluidMask = texture2D(tFluidMask, st).rgb;

    float alpha = msdf(tMap, vUv);
    float stroke = strokemsdf(tMap, vUv, 0.4, 1.);

    vec4 bubblesT = texture2D(tBubbles, st);
    float bubbles = (bubblesT.g - bubblesT.r * 0.5);

    float fluidMaskHardEdge = smoothstep(0.99, 1., fluidMask.g);
    float fluidMaskInner = smoothstep(0.79, .8, fluidMask.g);

    if(vMask < -1.2) discard;

    gl_FragColor.rgb = uColor;
    gl_FragColor.a = alpha *  1. - smoothstep(0.9, 1., fluidMask.g - stroke) +  (fluidMaskHardEdge - fluidMaskInner) + bubbles * fluidMaskHardEdge;

    //gl_FragColor = vec4(vec3(vAnimation), 1.0);
}
{@}TextMaskShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uAlpha;
uniform float uMaskPosition;

#!VARYINGS
varying vec2 vUv;
varying vec3 vWorldPosition;

#!SHADER: TextMaskShader.vs
void main() {
    vUv = uv;
    vWorldPosition = ( modelMatrix * vec4( position, 1.0 )).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: TextMaskShader.fs
void main() {
    vec2 st = gl_FragCoord.xy / resolution.xy;
    if((st.y) > (uMaskPosition / resolution.y)) {
        discard;
    }
    gl_FragColor = texture2D(tMap, vUv);
    gl_FragColor.rgb /= gl_FragColor.a;
}{@}ArrowShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uForce;
uniform float uTransition;
uniform vec3 uColor;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    vec2 uv = vUv;

    vec4 arrowMap = texture2D(tMap, uv);;
    const float uTransition = 1.;
    float alpha = arrowMap.r - (floor(uv.y + (1. - uTransition) + 0.01));
    gl_FragColor = vec4(mix(uColor, uColor * 1.8, 1. - floor(uv.y + (1. - uForce)) ), alpha);
}
{@}BallPBR.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uLightColor;

#!VARYINGS

#!SHADER: Vertex
#require(pbr.vs)
void main() {
    vec3 pos = position;
    setupPBR(pos);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment
#require(pbr.fs)

void main() {
    vec4 pbr = getPBR();
    vec4 color = linearToSRGB(pbr);

    gl_FragColor = color;
}
{@}ButtonText.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tFluidMask;

uniform vec3 uColor;
uniform vec3 uColorInverse;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex.vs

void main() {
    vUv = uv;
    vec3 pos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
#require(msdf.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 fluidMask = texture2D(tFluidMask, st).rgb;
    float fluid = smoothstep(0.99, 1., fluidMask.b * 4.);

    float alpha = msdf(tMap, vUv);

    gl_FragColor.rgb = mix(uColor, uColorInverse, fluid);
    gl_FragColor.a = alpha * uAlpha;
}
{@}ButtonUI.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform float uAlpha;
uniform vec2 uResolution;
uniform vec3 uColor;
uniform sampler2D tFluidMask;

#!VARYINGS
varying vec2 vUv;

#!SHADER: ButtonUI.vs
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: ButtonUI.fs
#require(roundedBorder.glsl)
#require(transformUV.glsl)
#require(simplenoise.glsl)
#require(range.glsl)

float smin( float a, float b, float k )
{
    k *= 2.0;
    float x = (b-a)/k;
    float g = 0.5*(x+sqrt(x*x+1.0));
    return b - k * g;
}

void main() {
    vec2 uv = vUv;
    vec2 st = gl_FragCoord.xy / resolution;
    float ratio = resolution.x / resolution.y;

    vec3 fluidMask = texture2D(tFluidMask, st).rgb;
    float noise = cnoise(vec2(vUv + time * 1.6));

    float fluid = smoothstep(0.99, 1., fluidMask.b * 4.);
    vec3 uvColor = vec3(uv, 1.0);
    float inside = 0.0;
    float insideRipple = 0.0;
    float insideNoise = 0.0;

    vec2 dir = (vUv - vec2(0.5)) / vec2(1., ratio);
    float dist = length(dir);
    float ripple = sin(10.0 * (time  - dist * 3.));

    uv = scaleUV(vUv, vec2(0.9,0.8));
    uv += dir * ripple * 0.04;


    float border = roundedBorder(1., 18., uv, uResolution, insideRipple);
    roundedBorder(1., 18., vUv, uResolution, inside);
    float noisedBorder = roundedBorder(1., 18., scaleUV(vUv, vec2(crange(noise, -1., 1., 0.95, 1.02))), uResolution, insideNoise);

    vec3 color = mix(uColor, uvColor, 0.0);
    gl_FragColor = vec4(mix(color, color, smoothstep(0.99, 1., fluidMask.g)), uAlpha);
    gl_FragColor += 0.1 * smoothstep(0.99, 1., fluidMask.b * 3.);

    gl_FragColor.a = mix((insideRipple + insideNoise ), noisedBorder, fluid) * uAlpha;
  
}{@}CupPBR.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uInsideColor;
uniform vec3 uOutsideColor;

#!VARYINGS

#!SHADER: Vertex
#require(pbr.vs)
void main() {
    vec3 pos = position;
    setupPBR(pos);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment
#require(pbr.fs)

void main() {
    vec4 mask = texture2D(tBaseColor, vUv);
    vec4 baseColor = vec4(uOutsideColor * mask.r + uInsideColor * mask.g, mask.a);
    vec4 pbr = getPBR(baseColor.rgb * uTint);
    vec4 color = linearToSRGB(pbr);

    gl_FragColor = color;
}
{@}IconPongShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tNoise;
uniform sampler2D tFluidMask;
uniform sampler2D tBubbles;

uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex.vs
void main() {
    vUv = uv;
    vec3 pos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
#require(msdf.glsl)
#require(transformUV.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 fluidMask = texture2D(tFluidMask, st).rgb;
    vec3 noise = texture2D(tNoise, st).rgb;

    float alpha = msdf(tMap, vUv);

    float fluidMaskHardEdge = smoothstep(0.99, 1., fluidMask.g);
    gl_FragColor.rgb = uColor;
    gl_FragColor.rgb += fluidMaskHardEdge * 0.2;

    gl_FragColor.a = alpha * uAlpha;
}
{@}ModalShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tTransition;
uniform float uTransition;

#!VARYINGS

#!SHADER: ModalShader.vs
void main() {
    gl_Position = vec4(position, 1.0);
}

#!SHADER: ModalShader.fs

#require(spritesheetUV.glsl)

void main() {
    vec2 uv = gl_FragCoord.xy / resolution;
    float alpha = texture2D(tTransition, spritesheetUV(uv, uTransition, 16., 16., 0.)).r;

    gl_FragColor = texture2D(tMap, uv);

    gl_FragColor.a = smoothstep(alpha, 0.2, 1.);
}{@}PlaneShadow.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: PlaneShadow.vs
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: PlaneShadow.fs
void main() {
    float circle = texture2D(tMap, vUv).r;

    gl_FragColor.rgb = vec3(circle);
    gl_FragColor.a = smoothstep(0., 1., circle * 1.2) * (1. - uAlpha);
}{@}PongFX.fs{@}uniform sampler2D tNoise;
uniform sampler2D tFluidMask;
uniform float uTime;
uniform sampler2D tSideText;
uniform float uCarouselClosed;

#require(transformUV.glsl)

void main() {
    vec2 uv = vUv;

    vec3 noise = texture2D(tNoise, vUv).rgb;
    vec3 fluidMask = texture2D(tFluidMask, vUv).rgb;

    // uv = scaleUV(uv, vec2(1. + (fluidMask.b * 0.1)));

    vec4 color = texture2D(tDiffuse, uv);
    color += noise.g * min(fluidMask.g, 0.15) * 0.5 * vUv.y * 1.4;

    vec3 sideTextColor = vec3(0., 0.41, 0.847);
    color.rgb = mix(color.rgb, sideTextColor, texture2D(tSideText, vUv).r * uCarouselClosed);
    
    gl_FragColor = color;
    
}
{@}PongSplashShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tFluid;
uniform sampler2D tFluidMask;
uniform sampler2D tPattern;
uniform sampler2D tBubbles;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform vec2 uThreshold;
uniform float uTile;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    vec4 finalPos = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = vec4(position.xy, finalPos.zw);
}

#!SHADER: Fragment
float aastep(float threshold, float value) {
    float signedDist = threshold - value;
    float d = fwidth(signedDist);
    return 1.0 - smoothstep(-d, d, signedDist);
}

void main() {
    vec2 uv = vUv;
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 bubbles = texture2D(tBubbles, st);

    float fluidMask = texture2D(tFluidMask, uv).b;
    
    uv += bubbles.rg * ((1. - bubbles.b) * 0.1);

    vec2 patternUv = uv * 2.0 - 1.0;
    patternUv *= (resolution.xy / min(resolution.x, resolution.y));
    vec3 pattern = texture2D(tPattern, patternUv * uTile).rgb;
    float alpha = aastep(uThreshold.x, fluidMask);
    if (alpha < 0.01) discard;
    vec3 color = uColor;
    color = mix(color, pattern, aastep(uThreshold.y, fluidMask));
    color *= alpha;
//    color = vec3(fluidMask);
    gl_FragColor = vec4(color, alpha);
}
{@}ShapeShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;
varying vec3 vPosition;

#!SHADER: ShapeShader.vs
void main() {
    vUv = uv;
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: ShapeShader.fs

float sdCircle( vec2 p, float r ){ return length(p) - r;}

void main() {
    gl_FragColor.rgb = uColor;
    gl_FragColor.a = uAlpha;
    gl_FragColor.a *= (1. - smoothstep(0.49, 0.50, sdCircle(vPosition.xy - vec2(0.5, -0.5), 0.)));
}{@}SplashPlaneShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tDiffuse;

#!VARYINGS
varying vec2 vUv;

#!SHADER: SplashPlaneShader.vs
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: SplashPlaneShader.fs
void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec4 color = texture2D(tDiffuse, st);

    gl_FragColor = color;
    gl_FragColor.a =  texture2D(tMap, vUv).r;
    // gl_FragColor.rgb /= 1. - texture2D(tMap, vUv).r;
}{@}TextPongShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tNoise;
uniform sampler2D tFluidMask;
uniform sampler2D tBubbles;

uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex.vs
void main() {
    vUv = uv;
    vec3 pos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
#require(msdf.glsl)
#require(transformUV.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 fluidMask = texture2D(tFluidMask, st).rgb;
    vec3 noise = texture2D(tNoise, st).rgb;

    vec4 bubblesT = texture2D(tBubbles, st);
    float bubbles = (bubblesT.g - bubblesT.r * 0.5);

    float alpha = msdf(tMap, vUv);
	float stroke = strokemsdf(tMap, vUv, 0.4, 1.);

    float fluidMaskHardEdge = smoothstep(0.99, 1., fluidMask.g);
    float fluidMaskInner = smoothstep(0.79, .8, fluidMask.g);

    gl_FragColor.rgb = uColor;

    gl_FragColor.a = alpha *  1. - smoothstep(0.9, 1., fluidMask.g - stroke) +  (fluidMaskHardEdge - fluidMaskInner) + bubbles * fluidMaskHardEdge;

}
{@}PoppingsShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tPos;
uniform sampler2D tMap;
uniform sampler2D tNoise;
uniform float uDPR;

#!VARYINGS
varying vec3 vNoise;

#!SHADER: Vertex

void main() {
    vec3 pos = texture2D(tPos, position.xy).xyz;
    vNoise = texture2D(tNoise, position.xy).rgb;

    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    
    gl_PointSize = (0.02 * uDPR) * (1000.0 / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;
}


#!SHADER: Fragment
#require(transformUV.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    vec4 color = texture2D(tMap, gl_PointCoord.xy);
    gl_FragColor = color;
}{@}PouroutFXShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tDiffuse;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = vec4(position, 1.0);
    vUv = uv;
}

#!SHADER: Fragment

#require(fastblur.fs)

void main()
{
    vec3 color = blur(tDiffuse, vUv, vUv * vec2(0.005)).rgb;
    // color = texture2D(tDiffuse, vUv).rgb;
    // better to use it as is, in this way we exploit the low resolution as an additional blurring factor, to then make it sharp where RT is used
    gl_FragColor = vec4(color, 1.);
}{@}PouroutShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tPos;
uniform float uDPR;

#!VARYINGS
varying vec3 vPos;


#!SHADER: Vertex
void main() {
    vec3 pos = texture2D(tPos, position.xy).xyz;
    vec3 vPos = pos;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (0.2 * uDPR) * (1000.0 / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;
}


#!SHADER: Fragment
#require(range.glsl)

void main() {
    vec2 uv = gl_PointCoord.xy;

    float dist = 1. - distance(uv, vec2(0.5)) * 2.;

    gl_FragColor = vec4(vec3(dist * .2, dist, dist * 2.), 1.);
}{@}RollingPass.fs{@}uniform sampler2D tBubbles;
uniform sampler2D tFluidMask;
uniform sampler2D tSideText;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;
uniform vec3 uColor6;
uniform vec3 uColor7;
uniform vec3 uColor8;

#require(transformUV.glsl)

void main() {
    vec2 uv = vUv;
    vec2 st = gl_FragCoord.xy / resolution;
    vec3 fluidMask = texture2D(tFluidMask, st).rgb;
    float fluid = smoothstep(0.9, 1., fluidMask.g);

    uv = scaleUV(uv, vec2(1. +  (fluidMask.b * 0.8)));

    float ratio = resolution.x / resolution.y;

    vec2 dir = (vUv - vec2(0.5)) / vec2(1., ratio);
    float dist = length(dir);
    float ripple = sin(40.0 * (time * 0.3 - dist));
    
    vec4 bubblesT = texture2D(tBubbles, st);
    float bubbles = (bubblesT.g - bubblesT.r);
    float bubblesPops = bubblesT.b;

    // uv += bubblesT.rg * ((1. - bubblesT.b) * 0.1);

    uv += dir * ripple * 0.04 * smoothstep(0., 0.4, fluidMask.g);

    vec3 color = texture2D(tDiffuse, uv).rgb;

    color += smoothstep(0.9, 1., fluidMask.g) * 0.1;

    color = mix(color, vec3(1.), (bubbles * smoothstep(0.8, 1., fluidMask.g)));
    color = mix(color, vec3(1.), (bubblesPops * smoothstep(0., 1., fluidMask.r - fluidMask.b)));

    vec3 sideTextColor = vec3(0., 0.41, 0.847);
    float sideTextAlpha = texture2D(tSideText, vUv).r;
    // color.rgb = mix(color.rgb, sideTextColor, texture2D(tSideText, vUv).r);

    if (sideTextAlpha > 0. && color.rgb == uColor1) {
        color.rgb = mix(color.rgb, uColor2, texture2D(tSideText, vUv).r);
    } else if (sideTextAlpha > 0. && color.rgb == uColor2) {
        color.rgb = mix(color.rgb, uColor1, texture2D(tSideText, vUv).r);
    } else if (sideTextAlpha > 0. && color.rgb == uColor3) {
        color.rgb = mix(color.rgb, uColor4, texture2D(tSideText, vUv).r);
    } else if (sideTextAlpha > 0. && color.rgb == uColor4) {
        color.rgb = mix(color.rgb, uColor3, texture2D(tSideText, vUv).r);
    } else if (sideTextAlpha > 0. && color.rgb == uColor5) {
        color.rgb = mix(color.rgb, uColor6, texture2D(tSideText, vUv).r);
    } else if (sideTextAlpha > 0. && color.rgb == uColor6) {
        color.rgb = mix(color.rgb, uColor5, texture2D(tSideText, vUv).r);
    } else if (sideTextAlpha > 0. && color.rgb == uColor7) {
        color.rgb = mix(color.rgb, uColor8, texture2D(tSideText, vUv).r);
    } else if (sideTextAlpha > 0. && color.rgb == uColor8) {
        color.rgb = mix(color.rgb, uColor7, texture2D(tSideText, vUv).r);
    }

    gl_FragColor = vec4(color, 1.0);
}
{@}TextRollingCan.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tFluidMask;
uniform sampler2D tBubbles;
uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex.vs
void main() {
    vUv = uv;
    vec3 pos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment.fs
#require(msdf.glsl)
#require(range.glsl)

void main() {
    vec2 st = gl_FragCoord.xy / resolution;
    float alpha = msdf(tMap, vUv);

    gl_FragColor.rgb = uColor;
    gl_FragColor.a = alpha;
}
{@}LevelMaskSpriteShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uAlpha;
uniform float uProgress;
uniform vec3 uColor;
uniform float uColorMix;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
#require(range.glsl)

void main() {
    vec4 color;
    if (uProgress > 0.0) {
        vec2 uv = vec2(vUv.x * 0.5, vUv.y);
        color = texture2D(tMap, uv);
        float mask = texture2D(tMap, uv + vec2(0.5, 0.0)).r;
        color *= step(mask, uProgress);
        color.rgb = mix(color.rgb, uColor * color.a, uColorMix);
    }
    color *= uAlpha;
    gl_FragColor = color;
}
{@}SplashFXShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tDiffuse;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = vec4(position, 1.0);
    vUv = uv;
}

#!SHADER: Fragment

#require(fastblur.fs)
#require(transformUV.glsl)

void main()
{
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 color = blur( tDiffuse, st, 1./resolution.xy ).rgb;

    // gl_FragColor = vec4(vec3(color), 1.);

    float liquid = 1. - smoothstep(color.r, .5, 1.);

    gl_FragColor = vec4( vec3(liquid), 1. );
}{@}SplashShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tPos;
uniform float uDPR;

#!VARYINGS
varying vec3 vPos;


#!SHADER: Vertex
void main() {
    vec3 pos = texture2D(tPos, position.xy).xyz;
    vec3 vPos = pos;
    vec4 mvPosition = modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = (0.1 * uDPR) * (1000.0 / length(mvPosition.xyz));
    gl_Position = projectionMatrix * mvPosition;
}


#!SHADER: Fragment
#require(range.glsl)

void main() {
    vec2 uv = gl_PointCoord.xy;

    float dist = 1. - distance(uv, vec2(0.5)) * 2.;

    gl_FragColor = vec4(vec3(dist * .8, dist * 0.2, dist * 0.05), 1.);
}{@}AnimatedFillText.glsl{@}#!ATTRIBUTES
attribute vec3 animation;
attribute vec2 local;

#!UNIFORMS
uniform sampler2D tMap;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uGlyphCount;
uniform float uAlpha;
uniform float uTransition;
uniform sampler2D tBubbles;

#!VARYINGS
varying vec2 vUv;
varying vec2 vLocal;
varying float vRand;
varying float vPos;

#!SHADER: Vertex.vs
#require(eases.glsl)
#require(simplenoise.glsl)
void main() {
    vUv = uv;
    vLocal = local;
    vRand = animation.x;
    vec3 pos = position;

    pos.y += 200.;
    pos.y *= smoothstep(0., 1., cnoise(vec2(time * 0.45 + animation.x / 10.)) * 0.3 + 1.0);
    pos.y -= 200.;

    float subTransition = smoothstep(0., 0.4, uTransition);

    pos.y -= 240. + animation.x * 50. * (1.0 - subTransition);
    pos.y += 240. * subTransition;
    vPos = pos.y;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}



#!SHADER: Fragment.fs
#require(msdf.glsl)
#require(simplenoise.glsl)
#require(range.glsl)

float rand(vec2 co){
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

void main() {
    if (vPos < -200.) discard;

    vec2 st = gl_FragCoord.xy / resolution;
    float alpha = msdf(tMap, vUv);

    float bubble = texture2D(tBubbles, st).r;

    float divider = 1. - (vLocal.y + abs(cnoise(vLocal * vec2(.3, .2) + time * 0.4 + vRand / 4.)) * 0.2);
    float colorTransition = smoothstep(crange(uTransition, 0.3, 1., -0.4, 1.32), crange(uTransition, 0.3, 1., -0.42, 1.31), divider);
    vec3 color = mix(uColor, uColor2, colorTransition);
    color += (bubble) * alpha * colorTransition;

    gl_FragColor.rgb = color;
    gl_FragColor.a = alpha;
}
{@}FruitPBR.glsl{@}#!ATTRIBUTES
attribute float transition;

#!UNIFORMS

#!VARYINGS
varying vec3 vPos;
varying vec3 vNormal;

#!SHADER: Vertex
#require(instance.vs)
#require(pbr.vs)
#require(range.glsl)
#require(eases.glsl)

void main() {
    #ifdef INSTANCED
        vec3 scaled = scale * 0.8 * cubicOut(transition);
        vec3 pos = transformPosition(position, offset, scaled, orientation);
    #else
        vec3 pos = position;
    #endif
    vec3 transformedNormal = normal;

    vPos = pos;
    vNormal = normal;

    setupPBR(pos, transformedNormal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment
#require(pbr.fs)
#require(shadows.fs)

void main() {
    float shadow = 1.;//getShadowPCSS(vPos, vNormal, 0.001 / 1024.);

    vec4 pbr = getPBR();
    vec4 color = linearToSRGB(pbr);

    gl_FragColor = vec4( mix( vec3(1., 0., 0.), color.rgb, shadow ), 1.0);
}
{@}TasteBudsFX.fs{@}uniform sampler2D tBubbles;
uniform sampler2D tFluidMask;
uniform sampler2D tSideText;
uniform sampler2D tSSAO;

uniform float uSSAOStrength;

#require(transformUV.glsl)

void main() {
    vec2 uv = vUv;
    vec2 st = gl_FragCoord.xy / resolution;

    vec3 fluidMask = texture2D(tFluidMask, vUv).rgb;
    uv = scaleUV(uv, vec2(1. +  (fluidMask.b * 0.8)));

    vec4 bubblesT = texture2D(tBubbles, vUv);
    float bubbles = (bubblesT.g - bubblesT.r) * 0.5;
    float bubblesPops = bubblesT.b;


    vec3 color = texture2D(tDiffuse, uv).rgb;
    float ssao = texture2D(tSSAO, uv).r;
    color *= (ssao * uSSAOStrength) + (1.0 - uSSAOStrength);

    color += smoothstep(0.9, 1., fluidMask.g) * 0.1
    + (bubbles * smoothstep(0.9, 1., fluidMask.g))
    + bubblesPops * smoothstep(0., 1., ( fluidMask.r - fluidMask.b));

    vec3 sideTextColor = vec3(1., 0.372, 0.);
    color.rgb = mix(color.rgb, sideTextColor, texture2D(tSideText, vUv).r);

    gl_FragColor = vec4(color , 1.0);
}
{@}CanPBR.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uLightColor;
uniform vec4 uLight;

#!VARYINGS

#!SHADER: Vertex
#require(pbr.vs)
void main() {
    vec3 pos = position;
    setupPBR(pos);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment
#require(pbr.fs)

void main() {
    vec4 pbr = getPBR();
    vec4 color = linearToSRGB(pbr);
    vec4 MRO = texture(tMRO, vUv);

    // color.rgb = mix(color.rgb, color.rgb + .1, MRO.r);

    gl_FragColor = color;
}
{@}FlatBackgroundShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uColor; //js new Color()

#!VARYINGS

#!SHADER: Vertex
void main() {
    vec3 pos = position;
    pos.z = 0.999;
    gl_Position = vec4(pos, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = vec4(uColor, 1.0);
}
{@}FlatColorShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uColor; //js new Color()

#!VARYINGS

#!SHADER: Vertex
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = vec4(uColor, 1.0);
}
{@}TestCollisionsShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tPos;
uniform float uScale;

#!VARYINGS
varying vec3 vPos;

#!SHADER: Vertex

void main() {

    vec4 data = texture2D(tPos, position.xy);
    vec3 pos = data.rgb;
    vPos = pos;

    vec4 mvPosition = modelViewMatrix * vec4(pos - vec3(0.5), 1.0);
    gl_PointSize = (100. / length(mvPosition.xyz)) / uScale;
    gl_Position = projectionMatrix * mvPosition;

}

#!SHADER: Fragment

void main() {
    vec2 uv = vec2(gl_PointCoord.x, gl_PointCoord.y);
    float alpha = smoothstep(0.5, 0.0, length(uv-0.5));

    vec2 st = 2. * uv - 1.;
    if(length(st) > 1. || alpha < 0.1) discard;
    float z = sqrt(1. - st.x * st.x - st.y * st.y);
    vec3 normal = vec3(st, z);

    vec3 lightPosition = vec3(0., .5, 2.);

    //test diffuse
    float diffuse = (dot(normalize(lightPosition - (vPos + normal / uScale)), normal));
    float ambient = 0.5;
    float shade = (diffuse) * (1. - ambient) + ambient;
    vec3 color = vec3(1.) * shade;


    gl_FragColor = vec4(color, alpha);
}
{@}NoiseShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform float uMask;
uniform float uFreqNoise;
uniform float uFactorTime;
uniform float uStrengthPattern;
uniform float uGlobalAmplitude;
uniform vec3 uNoiseActive;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = vec4(position, 1.0);
    vUv = uv;
}

#!SHADER: Fragment
#require(perlin.glsl)

void main()
{
    float ratio = resolution.x / resolution.y;
    vec2 squareUV = vUv / vec2(1., ratio);

    vec2 uv = squareUV;

    float gradientMask = distance(vUv, vec2(0.5)) * uMask;
    float noiseR = uNoiseActive.x > 0.5 ? perlin(vec3(uv * uFreqNoise,  time * 0.4 * uFactorTime)) * uStrengthPattern + uGlobalAmplitude + gradientMask : 0.;
    float noiseG = uNoiseActive.y > 0.5 ? perlin(vec3(uv * uFreqNoise * 1.,  time * 1. * uFactorTime)) * uStrengthPattern + uGlobalAmplitude + gradientMask : 0.;
    float noiseB = uNoiseActive.z > 0.5 ? perlin(vec3(uv * uFreqNoise * 4.,  time * 0.4 * uFactorTime)) * uStrengthPattern + uGlobalAmplitude + gradientMask : 0.;

    gl_FragColor = vec4(vec3(noiseR, noiseG, noiseB), 1.0);
}
{@}perlin.glsl{@}vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}

float perlin(vec3 P){
  vec3 Pi0 = floor(P); // Integer part for indexing
  vec3 Pi1 = Pi0 + vec3(1.0); // Integer part + 1
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P); // Fractional part for interpolation
  vec3 Pf1 = Pf0 - vec3(1.0); // Fractional part - 1.0
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;

  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);

  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);

  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);

  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
  vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
  vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
  vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
  vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);

  vec4 norm0 = taylorInvSqrt(vec4(dot(g000, g000), dot(g010, g010), dot(g100, g100), dot(g110, g110)));
  g000 *= norm0.x;
  g010 *= norm0.y;
  g100 *= norm0.z;
  g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001, g001), dot(g011, g011), dot(g101, g101), dot(g111, g111)));
  g001 *= norm1.x;
  g011 *= norm1.y;
  g101 *= norm1.z;
  g111 *= norm1.w;

  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x, Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x, Pf1.y, Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy, Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy, Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x, Pf0.y, Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x, Pf1.yz));
  float n111 = dot(g111, Pf1);

  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000, n100, n010, n110), vec4(n001, n101, n011, n111), fade_xyz.z);
  vec2 n_yz = mix(n_z.xy, n_z.zw, fade_xyz.y);
  float n_xyz = mix(n_yz.x, n_yz.y, fade_xyz.x); 
  return 2.2 * n_xyz;
}
{@}ScreenQuadAlpha.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;

#!VARYINGS

#!SHADER: ScreenQuadAlpha.vs
void main() {
    gl_Position = vec4(position, 1.0);
}

#!SHADER: ScreenQuadAlpha.fs
void main() {
    gl_FragColor = texture2D(tMap, gl_FragCoord.xy / resolution);
}{@}fastblur.fs{@}// from https://www.shadertoy.com/view/ltScRG

#define num_samples 16
#define level_of_detail 2 
#define tile_size (1 << level_of_detail)
#define sigma_val float(num_samples) * 0.25

float gaussian(vec2 i) {
    return exp( -0.5 * dot(i/sigma_val, i/sigma_val) ) / ( 6.28 * sigma_val*sigma_val );
}

vec4 blur(sampler2D sp, vec2 uv, vec2 scale) {
    vec4 result = vec4(0.);  
    int s = num_samples/tile_size;
    for ( int i = 0; i < s*s; i++ ) {
        vec2 d = vec2(i%s, i/s)*float(tile_size) - float(num_samples)/2.;
        result += gaussian(d) * textureLod( sp, uv + scale * d, float(level_of_detail) );
    }
    return result / result.a;
}
{@}SplashClearShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D uTarget;
uniform float canRender;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = vec4(texture2D(uTarget, vUv).rgb * canRender, 1.0);
}
{@}SplashCurveShader.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform float uTransition;
uniform sampler2D uTarget;
uniform float uVelocity;
uniform float aspectRatio;
uniform float canRender;
uniform float uAdd;

#!VARYINGS

#!SHADER: Vertex
#require(range.glsl)
#require(eases.glsl)

void main() {
    aspect = aspectRatio;
}

#!SHADER: Fragment
#require(range.glsl)

float blendScreen(float base, float blend) {
    return 1.0-((1.0-base)*(1.0-blend));
}

vec3 blendScreen(vec3 base, vec3 blend) {
    return vec3(blendScreen(base.r, blend.r), blendScreen(base.g, blend.g), blendScreen(base.b, blend.b));
}

void main() {
    float padding = vWidth * 0.5;
    float transition = crange(uTransition, 0.0, 1.0, -padding, 1.0 + padding);
    alpha *= crange(vUv.x, transition - padding, transition + padding, 1.0, 0.0);

    // round off the end of the shortened line
    float currentEnd = vUv2.y * uTransition;
    uvButt.x = min(0.5, vUv2.x * vLengthScale / buttLength) + (0.5 - min(0.5, (currentEnd - vUv2.x) * vLengthScale / buttLength));
    round = length(uvButt - 0.5);
    alpha *= 1.0 - smoothstep(0.45, 0.5, round);

    vec2 screenUV = gl_FragCoord.xy / resolution.xy;
    vec3 base = texture2D(uTarget, screenUV).xyz;
    base *= canRender;

    if (uVelocity > 0.0) {
        color = vec3(vDirection, 0.0) * uVelocity;
    } else {
        color = vec3(1.0);
    }
    color *= alpha;

    vec3 outColor = mix(blendScreen(base, color), base + color, uAdd);

    gl_FragColor = vec4(outColor, 1.0);
}
{@}AntimatterSpawn.fs{@}uniform float uMaxCount;
uniform float uSetup;
uniform float decay;
uniform vec2 decayRandom;
uniform sampler2D tLife;
uniform sampler2D tAttribs;
uniform float HZ;

#require(range.glsl)

void main() {
    vec2 uv = vUv;
    #test !window.Metal
    uv = gl_FragCoord.xy / fSize;
    #endtest

    vec4 data = texture2D(tInput, uv);

    if (vUv.x + vUv.y * fSize > uMaxCount) {
        gl_FragColor = vec4(9999.0);
        return;
    }

    vec4 life = texture2D(tLife, uv);
    vec4 random = texture2D(tAttribs, uv);
    if (life.x > 0.5) {
        data.xyz = life.yzw;
        data.x -= 999.0;
    } else {
        if (data.x < -500.0) {
            data.x = 1.0;
        } else {
            data.x -= 0.005 * decay * crange(random.w, 0.0, 1.0, decayRandom.x, decayRandom.y) * HZ;
        }
    }

    if (uSetup > 0.5) {
        data = vec4(0.0);
    }

    gl_FragColor = data;
}{@}curve3d.vs{@}uniform sampler2D tCurve;
uniform float uCurveSize;

vec2 getCurveUVFromIndex(float index) {
    float size = uCurveSize;
    vec2 ruv = vec2(0.0);
    float p0 = index / size;
    float y = floor(p0);
    float x = p0 - y;
    ruv.x = x;
    ruv.y = y / size;
    return ruv;
}

vec3 transformAlongCurve(vec3 pos, float idx) {
    vec3 offset = texture2D(tCurve, getCurveUVFromIndex(idx * (uCurveSize * uCurveSize))).xyz;
    vec3 p = pos;
    p.xz += offset.xz;
    return p;
}
{@}advectionManualFilteringShader.fs{@}varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform vec2 dyeTexelSize;
uniform float dt;
uniform float dissipation;
vec4 bilerp (sampler2D sam, vec2 uv, vec2 tsize) {
    vec2 st = uv / tsize - 0.5;
    vec2 iuv = floor(st);
    vec2 fuv = fract(st);
    vec4 a = texture2D(sam, (iuv + vec2(0.5, 0.5)) * tsize);
    vec4 b = texture2D(sam, (iuv + vec2(1.5, 0.5)) * tsize);
    vec4 c = texture2D(sam, (iuv + vec2(0.5, 1.5)) * tsize);
    vec4 d = texture2D(sam, (iuv + vec2(1.5, 1.5)) * tsize);
    return mix(mix(a, b, fuv.x), mix(c, d, fuv.x), fuv.y);
}
void main () {
    vec2 coord = vUv - dt * bilerp(uVelocity, vUv, texelSize).xy * texelSize;
    gl_FragColor = dissipation * bilerp(uSource, coord, dyeTexelSize);
    gl_FragColor.a = 1.0;
}{@}advectionShader.fs{@}varying vec2 vUv;
uniform sampler2D uVelocity;
uniform sampler2D uSource;
uniform vec2 texelSize;
uniform float dt;
uniform float dissipation;
void main () {
    vec2 coord = vUv - dt * texture2D(uVelocity, vUv).xy * texelSize;
    vec4 result = texture2D(uSource, coord);
    float decay = 1.0 + dissipation * dt;
    gl_FragColor = result / decay;
}
{@}backgroundShader.fs{@}varying vec2 vUv;
uniform sampler2D uTexture;
uniform float aspectRatio;
#define SCALE 25.0
void main () {
    vec2 uv = floor(vUv * SCALE * vec2(aspectRatio, 1.0));
    float v = mod(uv.x + uv.y, 2.0);
    v = v * 0.1 + 0.8;
    gl_FragColor = vec4(vec3(v), 1.0);
}{@}clearShader.fs{@}varying vec2 vUv;
uniform sampler2D uTexture;
uniform float value;
void main () {
    gl_FragColor = value * texture2D(uTexture, vUv);
}{@}colorShader.fs{@}uniform vec4 color;
void main () {
    gl_FragColor = color;
}{@}curlShader.fs{@}varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main () {
    float L = texture2D(uVelocity, vL).y;
    float R = texture2D(uVelocity, vR).y;
    float T = texture2D(uVelocity, vT).x;
    float B = texture2D(uVelocity, vB).x;
    float vorticity = R - L - T + B;
    gl_FragColor = vec4(0.5 * vorticity, 0.0, 0.0, 1.0);
}{@}displayShader.fs{@}varying vec2 vUv;
uniform sampler2D uTexture;
void main () {
    vec3 C = texture2D(uTexture, vUv).rgb;
    float a = max(C.r, max(C.g, C.b));
    gl_FragColor = vec4(vec3(C.r, C.r*0.6, C.r*0.05), a);
}{@}divergenceShader.fs{@}varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uVelocity;
void main () {
    float L = texture2D(uVelocity, vL).x;
    float R = texture2D(uVelocity, vR).x;
    float T = texture2D(uVelocity, vT).y;
    float B = texture2D(uVelocity, vB).y;
    vec2 C = texture2D(uVelocity, vUv).xy;
   if (vL.x < 0.0) { L = -C.x; }
   if (vR.x > 1.0) { R = -C.x; }
   if (vT.y > 1.0) { T = -C.y; }
   if (vB.y < 0.0) { B = -C.y; }
    float div = 0.5 * (R - L + T - B);
    gl_FragColor = vec4(div, 0.0, 0.0, 1.0);
}
{@}fluidBase.vs{@}varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform vec2 texelSize;

void main () {
    vUv = uv;
    vL = vUv - vec2(texelSize.x, 0.0);
    vR = vUv + vec2(texelSize.x, 0.0);
    vT = vUv + vec2(0.0, texelSize.y);
    vB = vUv - vec2(0.0, texelSize.y);
    gl_Position = vec4(position, 1.0);
}{@}gradientSubtractShader.fs{@}varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uVelocity;
vec2 boundary (vec2 uv) {
    return uv;
    // uv = min(max(uv, 0.0), 1.0);
    // return uv;
}
void main () {
    float L = texture2D(uPressure, boundary(vL)).x;
    float R = texture2D(uPressure, boundary(vR)).x;
    float T = texture2D(uPressure, boundary(vT)).x;
    float B = texture2D(uPressure, boundary(vB)).x;
    vec2 velocity = texture2D(uVelocity, vUv).xy;
    velocity.xy -= vec2(R - L, T - B);
    gl_FragColor = vec4(velocity, 0.0, 1.0);
}{@}pressureShader.fs{@}varying highp vec2 vUv;
varying highp vec2 vL;
varying highp vec2 vR;
varying highp vec2 vT;
varying highp vec2 vB;
uniform sampler2D uPressure;
uniform sampler2D uDivergence;
vec2 boundary (vec2 uv) {
    return uv;
    // uncomment if you use wrap or repeat texture mode
    // uv = min(max(uv, 0.0), 1.0);
    // return uv;
}
void main () {
    float L = texture2D(uPressure, boundary(vL)).x;
    float R = texture2D(uPressure, boundary(vR)).x;
    float T = texture2D(uPressure, boundary(vT)).x;
    float B = texture2D(uPressure, boundary(vB)).x;
    float C = texture2D(uPressure, vUv).x;
    float divergence = texture2D(uDivergence, vUv).x;
    float pressure = (L + R + B + T - divergence) * 0.25;
    gl_FragColor = vec4(pressure, 0.0, 0.0, 1.0);
}{@}splatShader.fs{@}varying vec2 vUv;
uniform sampler2D uTarget;
uniform float aspectRatio;
uniform vec3 color;
uniform vec3 bgColor;
uniform vec2 point;
uniform vec2 prevPoint;
uniform float radius;
uniform float canRender;
uniform float uAdd;

float blendScreen(float base, float blend) {
    return 1.0-((1.0-base)*(1.0-blend));
}

vec3 blendScreen(vec3 base, vec3 blend) {
    return vec3(blendScreen(base.r, blend.r), blendScreen(base.g, blend.g), blendScreen(base.b, blend.b));
}

float l(vec2 uv, vec2 point1, vec2 point2) {
    vec2 pa = uv - point1, ba = point2 - point1;
    pa.x *= aspectRatio;
    ba.x *= aspectRatio;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
}

float cubicOut(float t) {
    float f = t - 1.0;
    return f * f * f + 1.0;
}

void main () {
    vec3 splat = (1.0 - cubicOut(clamp(l(vUv, prevPoint.xy, point.xy) / radius, 0.0, 1.0))) * color;
    vec3 base = texture2D(uTarget, vUv).xyz;
    base *= canRender;

    vec3 outColor = mix(blendScreen(base, splat), base + splat, uAdd);
    gl_FragColor = vec4(outColor, 1.0);
}
{@}vorticityShader.fs{@}varying vec2 vUv;
varying vec2 vL;
varying vec2 vR;
varying vec2 vT;
varying vec2 vB;
uniform sampler2D uVelocity;
uniform sampler2D uCurl;
uniform float curl;
uniform float dt;
void main () {
    float L = texture2D(uCurl, vL).x;
    float R = texture2D(uCurl, vR).x;
    float T = texture2D(uCurl, vT).x;
    float B = texture2D(uCurl, vB).x;
    float C = texture2D(uCurl, vUv).x;
    vec2 force = 0.5 * vec2(abs(T) - abs(B), abs(R) - abs(L));
    force /= length(force) + 0.0001;
    force *= curl * C;
    force.y *= -1.0;
//    force.y += 400.3;
    vec2 vel = texture2D(uVelocity, vUv).xy;
    gl_FragColor = vec4(vel + force * dt, 0.0, 1.0);
}{@}FXScrollTransition.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap1;
uniform sampler2D tMap2;
uniform sampler2D tNoise;
uniform sampler2D tLiquid;
uniform float uTransition;
uniform float uAngle;
uniform float uVelocity;
uniform float uAngleVelocity;
uniform float uRatio;
uniform float uProgress;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;

    gl_Position = vec4(position, 1.0);
}

#!SHADER: Fragment
#require(range.glsl)
#require(simplenoise.glsl)
#require(transformUV.glsl)

float aastep(float threshold, float value) {
    float signedDist = threshold - value;
    float d = fwidth(signedDist);
    return 1.0 - smoothstep(-d, d, signedDist);
}

float aastep(float threshold, float value, float padding) {
    return smoothstep(threshold - padding, threshold + padding, value);
}

vec2 aastep(vec2 threshold, vec2 value) {
    return vec2(
        aastep(threshold.x, value.x),
        aastep(threshold.y, value.y)
    );
}

void main() {
    vec2 uv = vUv;

    vec3 noise = texture2D(tNoise, uv).rgb;
    float grain = getNoise(uv, time);
    vec3 liquid = texture2D(tLiquid, uv).rgb;

    vec2 distordedNoise = scaleUV(uv, vec2(1. + (noise.b * 0.2 + grain * 0.05) * uVelocity));

    vec3 color1 = texture2D(tMap1, distordedNoise).rgb;
    vec3 color2 = texture2D(tMap2, distordedNoise).rgb;
    liquid.r = smoothstep(1. - liquid.r, 0.9, 1.);


    float inclination = crange(sin(((time * 0.5 + uv.x) * .4) * 20.), -1., 1., -0.2, 0.);

    //float inclination = -0.2 * uAngle * uRatio;
    // inclination += -0.2 * uVelocity * uAngleVelocity * uRatio;

    float cut = aastep(uv.y + (uv.x * inclination), crange(uTransition, 0.0, 1.0, inclination, 1.0));
    float cut2 = aastep(uv.y + 0.01 + smoothstep(0., .2, noise.r * uv.y * .02) + (uv.x * inclination), crange(uTransition, 0.0, 1.0, inclination, 1.0));

    vec3 color = mix(color1, color2, cut);
    float liquidInfluence = mix(1. - liquid.r, 1., crange(uProgress, 0., 0.4, 0., 1.));
    color = mix(color, mix(color, color * 1.1,liquidInfluence), cut - cut2);

    gl_FragColor.rgb = color;
    gl_FragColor.a = 1.0 ;
}
{@}AreaLights.glsl{@}mat3 transposeMat3(  mat3 m ) {
	mat3 tmp;
	tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
	tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
	tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
	return tmp;
}

// Real-Time Polygonal-Light Shading with Linearly Transformed Cosines
// by Eric Heitz, Jonathan Dupuy, Stephen Hill and David Neubelt
// code: https://github.com/selfshadow/ltc_code/
vec2 LTC_Uv(  vec3 N,  vec3 V,  float roughness ) {
	float LUT_SIZE  = 64.0;
	float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	float LUT_BIAS  = 0.5 / LUT_SIZE;
	float dotNV = clamp( dot( N, V ), 0.0, 1.0 );
	// texture parameterized by sqrt( GGX alpha ) and sqrt( 1 - cos( theta ) )
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}

float LTC_ClippedSphereFormFactor(  vec3 f ) {
	// Real-Time Area Lighting: a Journey from Research to Production (p.102)
	// An approximation of the form factor of a horizon-clipped rectangle.
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}

vec3 LTC_EdgeVectorFormFactor(  vec3 v1,  vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	// rational polynomial approximation to theta / sin( theta ) / 2PI
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}

vec3 LTC_Evaluate(  vec3 N,  vec3 V,  vec3 P,  mat3 mInv,  vec3 rectCoords[ 4 ] ) {
	// bail if point is on back side of plane of light
	// assumes ccw winding order of light vertices
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	// construct orthonormal basis around N
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 ); // negated from paper; possibly due to a different handedness of world coordinate system
	// compute transform
	mat3 mat = mInv * transposeMat3( mat3( T1, T2, N ) );
	// transform rect
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	// project rect onto sphere
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	// calculate vector form factor
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	// adjust for horizon clipping
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );

	return vec3( result );
}{@}Lighting.glsl{@}#!ATTRIBUTES

#!UNIFORMS
struct LightConfig {
    vec3 normal;
    bool phong;
    bool areaToPoint;
    float phongAttenuation;
    float phongShininess;
    vec3 phongColor;
    vec3 lightColor;
    bool overrideColor;
};

uniform sampler2D tLTC1; //ignoreUIL
uniform sampler2D tLTC2; //ignoreUIL

#!VARYINGS
varying vec3 vPos;
varying vec3 vWorldPos;
varying vec3 vNormal;
varying vec3 vViewDir;

#!SHADER: lighting.vs

void setupLight(vec3 p0, vec3 p1) { //inlinemain
    vPos = p0;
    vNormal = normalize(normalMatrix * p1);
    vWorldPos = vec3(modelMatrix * vec4(p0, 1.0));
    vViewDir = -vec3(modelViewMatrix * vec4(p0, 1.0));
}

#test !window.Metal
void setupLight(vec3 p0) {
    setupLight(p0, normal);
}
#endtest

#!SHADER: lighting.fs

#require(LightingCommon.glsl)

void setupLight() {

}
vec3 getCombinedColor(LightConfig config, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix, sampler2D tLTC1, sampler2D tLTC2) {
    vec3 color = vec3(0.0);

    #pragma unroll_loop
    for (int i = 0; i < NUM_LIGHTS; i++) {
        vec3 lColor = config.overrideColor ? config.lightColor : lightColor[i].rgb;
        vec3 lPos = lightPos[i].rgb;
        vec4 lData = lightData[i];
        vec4 lData2 = lightData2[i];
        vec4 lData3 = lightData3[i];
        vec4 lProps = lightProperties[i];

        if (lProps.w < 1.0) continue;

        if (lProps.w < 1.1) {
            color += lightDirectional(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
        } else if (lProps.w < 2.1) {
            color += lightPoint(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
        } else if (lProps.w < 3.1) {
            color += lightCone(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
        } else if (lProps.w < 4.1) {
            color += lightArea(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix, tLTC1, tLTC2);
        }
    }

    return lclamp(color);
}

vec3 getCombinedColor(LightConfig config) {
    #test !window.Metal
    return getCombinedColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix, tLTC1, tLTC2);
    #endtest
    return vec3(0.0);
}

vec3 getCombinedColor() {
    LightConfig config;
    config.normal = vNormal;
    return getCombinedColor(config);
}

vec3 getCombinedColor(vec3 normal) {
    LightConfig config;
    config.normal = normal;
    return getCombinedColor(config);
}

vec3 getCombinedColor(vec3 normal, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix, sampler2D tLTC1, sampler2D tLTC2) {
    LightConfig config;
    config.normal = normal;
    return getCombinedColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix, tLTC1, tLTC2);
}

vec3 getPointLightColor(LightConfig config, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    vec3 color = vec3(0.0);

    #pragma unroll_loop
    for (int i = 0; i < NUM_LIGHTS; i++) {
        vec3 lColor = config.overrideColor ? config.lightColor : lightColor[i].rgb;
        vec3 lPos = lightPos[i].rgb;
        vec4 lData = lightData[i];
        vec4 lData2 = lightData2[i];
        vec4 lData3 = lightData3[i];
        vec4 lProps = lightProperties[i];

        if (lProps.w > 1.9 && lProps.w < 2.1) {
            color += lightPoint(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
        }
    }

    return lclamp(color);
}

vec3 getPointLightColor(LightConfig config) {
    #test !window.Metal
    return getPointLightColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
    #endtest
    return vec3(0.0);
}

vec3 getPointLightColor() {
    LightConfig config;
    config.normal = vNormal;
    return getPointLightColor(config);
}

vec3 getPointLightColor(vec3 normal) {
    LightConfig config;
    config.normal = normal;
    return getPointLightColor(config);
}

vec3 getPointLightColor(vec3 normal, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    LightConfig config;
    config.normal = normal;
    return getPointLightColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
}

vec3 getAreaLightColor(float roughness, LightConfig config, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix, sampler2D tLTC1, sampler2D tLTC2) {
    vec3 color = vec3(0.0);

    #test Lighting.fallbackAreaToPointTest()
    config.areaToPoint = true;
    #endtest

    #pragma unroll_loop
    for (int i = 0; i < NUM_LIGHTS; i++) {
        vec3 lColor = config.overrideColor ? config.lightColor : lightColor[i].rgb;
        vec3 lPos = lightPos[i].rgb;
        vec4 lData = lightData[i];
        vec4 lData2 = lightData2[i];
        vec4 lData3 = lightData3[i];
        vec4 lProps = lightProperties[i];

        lData.w *= roughness;

        if (lProps.w > 3.9 && lProps.w < 4.1) {
            if (config.areaToPoint) {
                color += lightPoint(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
            } else {
                color += lightArea(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix, tLTC1, tLTC2);
            }
        }
    }

    return lclamp(color);
}

vec3 getAreaLightColor(float roughness, LightConfig config) {
    #test !window.Metal
    return getAreaLightColor(roughness, config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix, tLTC1, tLTC2);
    #endtest
    return vec3(0.0);
}


vec3 getAreaLightColor(float roughness) {
    LightConfig config;
    config.normal = vNormal;
    return getAreaLightColor(roughness, config);
}

vec3 getAreaLightColor() {
    LightConfig config;
    config.normal = vNormal;
    return getAreaLightColor(1.0, config);
}

vec3 getAreaLightColor(LightConfig config) {
    return getAreaLightColor(1.0, config);
}

vec3 getAreaLightColor(vec3 normal) {
    LightConfig config;
    config.normal = normal;
    return getAreaLightColor(1.0, config);
}

vec3 getAreaLightColor(vec3 normal, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix, sampler2D tLTC1, sampler2D tLTC2) {
    LightConfig config;
    config.normal = normal;
    return getAreaLightColor(1.0, config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix, tLTC1, tLTC2);
}


vec3 getSpotLightColor(LightConfig config, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    vec3 color = vec3(0.0);

    #pragma unroll_loop
    for (int i = 0; i < NUM_LIGHTS; i++) {
        vec3 lColor = config.overrideColor ? config.lightColor : lightColor[i].rgb;
        vec3 lPos = lightPos[i].rgb;
        vec4 lData = lightData[i];
        vec4 lData2 = lightData2[i];
        vec4 lData3 = lightData3[i];
        vec4 lProps = lightProperties[i];

        if (lProps.w > 2.9 && lProps.w < 3.1) {
            color += lightCone(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
        }
    }

    return lclamp(color);
}

vec3 getSpotLightColor(LightConfig config) {
    #test !window.Metal
    return getSpotLightColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
    #endtest
    return vec3(0.0);
}

vec3 getSpotLightColor() {
    LightConfig config;
    config.normal = vNormal;
    return getSpotLightColor(config);
}

vec3 getSpotLightColor(vec3 normal) {
    LightConfig config;
    config.normal = normal;
    return getSpotLightColor(config);
}

vec3 getSpotLightColor(vec3 normal, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    LightConfig config;
    config.normal = normal;
    return getSpotLightColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
}


vec3 getDirectionalLightColor(LightConfig config, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    vec3 color = vec3(0.0);

    #pragma unroll_loop
    for (int i = 0; i < NUM_LIGHTS; i++) {
        vec3 lColor = config.overrideColor ? config.lightColor : lightColor[i].rgb;
        vec3 lPos = lightPos[i].rgb;
        vec4 lData = lightData[i];
        vec4 lData2 = lightData2[i];
        vec4 lData3 = lightData3[i];
        vec4 lProps = lightProperties[i];

        if (lProps.w > 0.9 && lProps.w < 1.1) {
            color += lightDirectional(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
        }
    }

    return lclamp(color);
}

vec3 getDirectionalLightColor(LightConfig config) {
    #test !window.Metal
    return getDirectionalLightColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
    #endtest
    return vec3(0.0);
}

vec3 getDirectionalLightColor(vec3 normal) {
    LightConfig config;
    config.normal = normal;
    return getDirectionalLightColor(config);
}

vec3 getDirectionalLightColor() {
    LightConfig config;
    config.normal = vNormal;
    return getDirectionalLightColor(config);
}

vec3 getDirectionalLightColor(vec3 normal, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    LightConfig config;
    config.normal = vNormal;
    return getDirectionalLightColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
}

vec3 getStandardColor(LightConfig config, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    vec3 color = vec3(0.0);

    #pragma unroll_loop
    for (int i = 0; i < NUM_LIGHTS; i++) {
        vec3 lColor = config.overrideColor ? config.lightColor : lightColor[i].rgb;
        vec3 lPos = lightPos[i].rgb;
        vec4 lData = lightData[i];
        vec4 lData2 = lightData2[i];
        vec4 lData3 = lightData3[i];
        vec4 lProps = lightProperties[i];

        if (lProps.w < 1.0) continue;

        if (lProps.w < 1.1) {
            color += lightDirectional(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
        } else if (lProps.w < 2.1) {
            color += lightPoint(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
        }
    }

    return lclamp(color);
}

vec3 getStandardColor(LightConfig config) {
    #test !window.Metal
    return getStandardColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
    #endtest
    return vec3(0.0);
}

vec3 getStandardColor() {
    LightConfig config;
    config.normal = vNormal;
    return getStandardColor(config);
}

vec3 getStandardColor(vec3 normal) {
    LightConfig config;
    config.normal = normal;
    return getStandardColor(config);
}

vec3 getStandardColor(vec3 normal, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    LightConfig config;
    config.normal = normal;
    return getStandardColor(config, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);
}
{@}LightingCommon.glsl{@}#require(AreaLights.glsl)

vec3 lworldLight(vec3 lightPos, vec3 localPos, mat4 modelViewMatrix, mat4 viewMatrix) {
    vec4 mvPos = modelViewMatrix * vec4(localPos, 1.0);
    vec4 worldPosition = viewMatrix * vec4(lightPos, 1.0);
    return worldPosition.xyz - mvPos.xyz;
}

float lrange(float oldValue, float oldMin, float oldMax, float newMin, float newMax) {
    vec3 sub = vec3(oldValue, newMax, oldMax) - vec3(oldMin, newMin, oldMin);
    return sub.x * sub.y / sub.z + newMin;
}

vec3 lclamp(vec3 v) {
    return clamp(v, vec3(0.0), vec3(1.0));
}

float lcrange(float oldValue, float oldMin, float oldMax, float newMin, float newMax) {
    return clamp(lrange(oldValue, oldMin, oldMax, newMin, newMax), min(newMax, newMin), max(newMin, newMax));
}

#require(Phong.glsl)

vec3 lightDirectional(LightConfig config, vec3 lColor, vec3 lPos, vec4 lData, vec4 lData2, vec4 lData3, vec4 lProps, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    vec3 lDir = lworldLight(lPos, vPos, modelViewMatrix, viewMatrix);
    float volume = dot(normalize(lDir), config.normal);

    return lColor * lcrange(volume, 0.0, 1.0, lProps.z, 1.0);
}

vec3 lightPoint(LightConfig config, vec3 lColor, vec3 lPos, vec4 lData, vec4 lData2, vec4 lData3, vec4 lProps, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    float dist = length(vWorldPos - lPos);
    if (dist > lProps.y) return vec3(0.0);

    vec3 color = vec3(0.0);

    vec3 lDir = lworldLight(lPos, vPos, modelViewMatrix, viewMatrix);
    float falloff = pow(lcrange(dist, 0.0, lProps.y, 1.0, 0.0), 2.0);

    if (config.phong) {
        color += falloff * phong(lProps.x, lColor, config.phongColor, config.phongShininess, config.phongAttenuation, config.normal, normalize(lDir), vViewDir, lProps.z);
    } else {
        float volume = dot(normalize(lDir), config.normal);
        volume = lcrange(volume, 0.0, 1.0, lProps.z, 1.0);
        color += lColor * volume * lProps.x * falloff;
    }

    return color;
}

vec3 lightCone(LightConfig config, vec3 lColor, vec3 lPos, vec4 lData, vec4 lData2, vec4 lData3, vec4 lProps, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix) {
    float dist = length(vWorldPos - lPos);
    if (dist > lProps.y) return vec3(0.0);

    vec3 lDir = lworldLight(lPos, vPos, modelViewMatrix, viewMatrix);
    vec3 sDir = degrees(-lData.xyz);
    float radius = lData.w;
    vec3 surfacePos = vWorldPos;
    vec3 surfaceToLight = normalize(lPos - surfacePos);
    float lightToSurfaceAngle = degrees(acos(dot(-surfaceToLight, normalize(sDir))));
    float attenuation = 1.0;

    vec3 nColor = lightPoint(config, lColor, lPos, lData, lData2, lData3, lProps, vPos, vWorldPos, vViewDir, modelViewMatrix, viewMatrix);

    float featherMin = 1.0 - lData2.x*0.1;
    float featherMax = 1.0 + lData2.x*0.1;

    attenuation *= smoothstep(lightToSurfaceAngle*featherMin, lightToSurfaceAngle*featherMax, radius);

    nColor *= attenuation;
    return nColor;
}

vec3 lightArea(LightConfig config, vec3 lColor, vec3 lPos, vec4 lData, vec4 lData2, vec4 lData3, vec4 lProps, vec3 vPos, vec3 vWorldPos, vec3 vViewDir, mat4 modelViewMatrix, mat4 viewMatrix, sampler2D tLTC1, sampler2D tLTC2) {
    float dist = length(vWorldPos - lPos);
    if (dist > lProps.y) return vec3(0.0);

    vec3 color = vec3(0.0);

    vec3 normal = config.normal;
    vec3 viewDir = normalize(vViewDir);
    vec3 position = -vViewDir;
    float roughness = lData.w;
    vec3 mPos = lData.xyz;
    vec3 halfWidth = lData2.xyz;
    vec3 halfHeight = lData3.xyz;

    float falloff = pow(lcrange(dist, 0.0, lProps.y, 1.0, 0.0), 2.0);

    vec3 rectCoords[ 4 ];
    rectCoords[ 0 ] = mPos + halfWidth - halfHeight;
    rectCoords[ 1 ] = mPos - halfWidth - halfHeight;
    rectCoords[ 2 ] = mPos - halfWidth + halfHeight;
    rectCoords[ 3 ] = mPos + halfWidth + halfHeight;

    vec2 uv = LTC_Uv( normal, viewDir, roughness );

    #test !!window.Metal
    uv.y = 1.0 - uv.y;
    #endtest

    vec4 t1 = texture2D(tLTC1, uv);
    vec4 t2 = texture2D(tLTC2, uv);

    mat3 mInv = mat3(
    vec3( t1.x, 0, t1.y ),
    vec3(    0, 1,    0 ),
    vec3( t1.z, 0, t1.w )
    );

    vec3 fresnel = ( lColor * t2.x + ( vec3( 1.0 ) - lColor ) * t2.y );
    color += lColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords ) * falloff * lProps.x;
    color += lColor * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords ) * falloff * lProps.x;

    return color;
}{@}LitMaterial.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;

#!VARYINGS
varying vec2 vUv;
varying vec3 vPos;

#!SHADER: Vertex

#require(lighting.vs)

void main() {
    vUv = uv;
    vPos = position;
    setupLight(position);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment

#require(lighting.fs)
#require(shadows.fs)

void main() {
    setupLight();

    vec3 color = texture2D(tMap, vUv).rgb;
    color *= getShadow(vPos);

    color += getCombinedColor();

    gl_FragColor = vec4(color, 1.0);
}{@}Phong.glsl{@}float pclamp(float v) {
    return clamp(v, 0.0, 1.0);
}

float dPhong(float shininess, float dotNH) {
    return (shininess * 0.5 + 1.0) * pow(dotNH, shininess);
}

vec3 schlick(vec3 specularColor, float dotLH) {
    float fresnel = exp2((-5.55437 * dotLH - 6.98316) * dotLH);
    return (1.0 - specularColor) * fresnel + specularColor;
}

vec3 calcBlinnPhong(vec3 specularColor, float shininess, vec3 normal, vec3 lightDir, vec3 viewDir) {
    vec3 halfDir = normalize(lightDir + viewDir);
    
    float dotNH = pclamp(dot(normal, halfDir));
    float dotLH = pclamp(dot(lightDir, halfDir));

    vec3 F = schlick(specularColor, dotLH);
    float G = 0.85;
    float D = dPhong(shininess, dotNH);
    
    return F * G * D;
}

vec3 calcBlinnPhong(vec3 specularColor, float shininess, vec3 normal, vec3 lightDir, vec3 viewDir, float minTreshold) {
    vec3 halfDir = normalize(lightDir + viewDir);

    float dotNH = pclamp(dot(normal, halfDir));
    float dotLH = pclamp(dot(lightDir, halfDir));

    dotNH = lrange(dotNH, 0.0, 1.0, minTreshold, 1.0);
    dotLH = lrange(dotLH, 0.0, 1.0, minTreshold, 1.0);

    vec3 F = schlick(specularColor, dotLH);
    float G = 0.85;
    float D = dPhong(shininess, dotNH);

    return F * G * D;
}

vec3 phong(float amount, vec3 diffuse, vec3 specular, float shininess, float attenuation, vec3 normal, vec3 lightDir, vec3 viewDir, float minThreshold) {
    float cosineTerm = pclamp(lrange(dot(normal, lightDir), 0.0, 1.0, minThreshold, 1.0));
    vec3 brdf = calcBlinnPhong(specular, shininess, normal, lightDir, viewDir, minThreshold);
    return brdf * amount * diffuse * attenuation * cosineTerm;
}{@}Line.glsl{@}#!ATTRIBUTES
attribute vec3 previous;
attribute vec3 next;
attribute float side;
attribute float width;
attribute float lineIndex;
attribute vec2 uv2;

#!UNIFORMS
uniform float uLineWidth;
uniform float uBaseWidth;
uniform float uOpacity;
uniform vec3 uColor;

#!VARYINGS
varying float vLineIndex;
varying vec2 vUv;
varying vec2 vUv2;
varying vec3 vColor;
varying float vOpacity;
varying float vWidth;
varying float vDist;
varying float vFeather;
varying float vLengthScale;
varying vec2 vDirection;


#!SHADER: Vertex

//params

vec2 fix(vec4 i, float aspect) {
    vec2 res = i.xy / i.w;
    res.x *= aspect;
    return res;
}

void main() {
#test RenderManager.type == RenderManager.VR
    float aspect = (resolution.x / 2.0) / resolution.y;
#endtest
#test RenderManager.type != RenderManager.VR
    float aspect = resolution.x / resolution.y;
#endtest

    vUv = uv;
    vUv2 = uv2;
    vLineIndex = lineIndex;
    vColor = uColor;
    vOpacity = uOpacity;
    vFeather = 0.1;

    vec3 pos = position;
    vec3 prevPos = previous;
    vec3 nextPos = next;
    float lineWidth = 1.0;
    //main

    //startMatrix
    mat4 m = projectionMatrix * modelViewMatrix;
    vec4 finalPosition = m * vec4(pos, 1.0);
    vec4 pPos = m * vec4(prevPos, 1.0);
    vec4 nPos = m * vec4(nextPos, 1.0);
    //endMatrix

    vec2 currentP = fix(finalPosition, aspect);
    vec2 prevP = fix(pPos, aspect);
    vec2 nextP = fix(nPos, aspect);

    float w = uBaseWidth * uLineWidth * width * lineWidth;
    vWidth = w;

    vec4 temp1 = vec4(0.0, 0.0, pos.z, 1.0);
    temp1 = m * temp1;
    vec4 temp2 = vec4(1.0, 0.0, pos.z, 1.0);
    temp2 = m * temp2;
    vLengthScale = abs(temp2.x - temp1.x);

    vec2 dirNC = currentP - prevP;
    vec2 dirPC = nextP - currentP;
    if (length(dirNC) >= 0.0001) dirNC = normalize(dirNC);
    if (length(dirPC) >= 0.0001) dirPC = normalize(dirPC);
    vec2 dir = normalize(dirNC + dirPC);
    vDirection = dir;

    //direction
    vec2 normal = vec2(-dir.y, dir.x);
    normal.x /= aspect;
    normal *= 0.5 * w;

    vDist = finalPosition.z / 10.0;

    finalPosition.xy += normal * side;
    gl_Position = finalPosition;
}

#!SHADER: Fragment

//fsparams

void main() {
    float d = (1.0 / (5.0 * vWidth + 1.0)) * vFeather * (vDist * 5.0 + 0.5);
    vec2 uvButt = vec2(0.0, vUv.y);
    float buttLength = 0.5 * vWidth;
    uvButt.x = min(0.5, vUv2.x * vLengthScale / buttLength) + (0.5 - min(0.5, (vUv2.y - vUv2.x) * vLengthScale / buttLength));
    float round = length(uvButt - 0.5);
    float alpha = 1.0 - smoothstep(0.45, 0.5, round);

    /*
        If you're having antialiasing problems try:
        Remove line 93 to 98 and replace with
        `
            float signedDist = tri(vUv.y) - 0.5;
            float alpha = clamp(signedDist/fwidth(signedDist) + 0.5, 0.0, 1.0);

            if (w <= 0.3) {
                discard;
                return;
            }

            where tri function is

            float tri(float v) {
                return mix(v, 1.0 - v, step(0.5, v)) * 2.0;
            }
        `

        Then, make sure your line has transparency and remove the last line
        if (gl_FragColor.a < 0.1) discard;
    */

    vec3 color = vColor;

    gl_FragColor.rgb = color;
    gl_FragColor.a = alpha;
    gl_FragColor.a *= vOpacity;

    //fsmain

    if (gl_FragColor.a < 0.1) discard;
}
{@}mousefluid.fs{@}uniform sampler2D tFluid;
uniform sampler2D tFluidMask;

vec2 getFluidVelocity() {
    float fluidMask = smoothstep(0.1, 0.7, texture2D(tFluidMask, vUv).r);
    return texture2D(tFluid, vUv).xy * fluidMask;
}

vec3 getFluidVelocityMask() {
    float fluidMask = smoothstep(0.1, 0.7, texture2D(tFluidMask, vUv).r);
    return vec3(texture2D(tFluid, vUv).xy * fluidMask, fluidMask);
}{@}ProtonAntimatter.fs{@}uniform sampler2D tOrigin;
uniform sampler2D tAttribs;
uniform float uMaxCount;
//uniforms

#require(range.glsl)
//requires

void main() {
    vec2 uv = vUv;
    #test !window.Metal
    uv = gl_FragCoord.xy / fSize;
    #endtest

    vec3 origin = texture2D(tOrigin, uv).xyz;
    vec4 inputData = texture2D(tInput, uv);
    vec3 pos = inputData.xyz;
    vec4 random = texture2D(tAttribs, uv);
    float data = inputData.w;

    if (vUv.x + vUv.y * fSize > uMaxCount) {
        gl_FragColor = vec4(9999.0);
        return;
    }

    //code

    gl_FragColor = vec4(pos, data);
}{@}ProtonAntimatterLifecycle.fs{@}uniform sampler2D tOrigin;
uniform sampler2D tAttribs;
uniform sampler2D tSpawn;
uniform float uMaxCount;
//uniforms

#require(range.glsl)
//requires

void main() {
    vec3 origin = texture2D(tOrigin, vUv).rgb;
    vec4 inputData = texture2D(tInput, vUv);
    vec3 pos = inputData.xyz;
    vec4 random = texture2D(tAttribs, vUv);
    float data = inputData.w;

    if (vUv.x + vUv.y * fSize > uMaxCount) {
        gl_FragColor = vec4(9999.0);
        return;
    }

    vec4 spawn = texture2D(tSpawn, vUv);
    float life = spawn.x;

    if (spawn.x < -500.0) {
        pos = spawn.xyz;
        pos.x += 999.0;
        spawn.x = 1.0;
        gl_FragColor = vec4(pos, data);
        return;
    }

    //abovespawn
    if (spawn.x <= 0.0) {
        pos.x = 9999.0;
        gl_FragColor = vec4(pos, data);
        return;
    }

    //abovecode
    //code

    gl_FragColor = vec4(pos, data);
}{@}ProtonNeutrino.fs{@}//uniforms

#require(range.glsl)
//requires

void main() {
    //code
}{@}SceneLayout.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vec3 pos = position;
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = texture2D(tMap, vUv);
    gl_FragColor.a *= uAlpha;
    gl_FragColor.rgb /= gl_FragColor.a;
}{@}GLUIShape.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform vec3 uColor;
uniform float uAlpha;

#!VARYINGS

#!SHADER: Vertex
void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = vec4(uColor, uAlpha);
}{@}GLUIShapeBitmap.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tMask;
uniform float uAlpha;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = texture2D(tMap, vUv) * texture2D(tMask, vUv).a;
    gl_FragColor.a *= uAlpha;
}{@}calcnormalfromdepth.glsl{@}vec3 uvToEyePos(in sampler2D depth, in vec2 uv) {
    float linearDepth = getDepthValue(depth, uv, 0.1, 1000.0);
    return (vec3(2.0 * uv - 1.0, -1.0) * uFrustum * linearDepth);
}

vec3 uvToEyePos(in float depth, in vec2 uv) {
    float linearDepth = getDepthValue(depth, 0.1, 1000.0);
    return (vec3(2.0 * uv - 1.0, -1.0) * uFrustum * linearDepth);
}

//if we trivialy accept differences between depths, there can be cases
//where the shortest difference does not belong to the same edge, and because of that
//a second depth is used to extrapolate the nearest depth value.
//points that are on the same surface should (based on the diagram) more or less
//end up at the same depth as the sampled one.
//this is explained here: https://atyuwen.github.io/posts/normal-reconstruction/

vec3 calcNormalFromDepth(in float _depth, in vec2 _uv) {
    vec2 texSize = 1.0 / uResolution;
    ivec2 uv = ivec2(_uv * uResolution);

    if (abs(_depth) >= 1.0) {
        return vec3(0.0);
    }

    vec3 posEye = uvToEyePos(_depth, _uv);

    //find best depth along x...
    float dr = texelFetch(tDepth, uv + ivec2(1, 0), 0).x;
    float dr2 = texelFetch(tDepth, uv + ivec2(2, 0), 0).x;
    float dl = texelFetch(tDepth, uv - ivec2(1, 0), 0).x;
    float dl2 = texelFetch(tDepth, uv - ivec2(2, 0), 0).x;

    vec3 ddx = uvToEyePos(dr, _uv + vec2(texSize.x, 0.0)) - posEye;
    vec3 ddx2 = posEye - uvToEyePos(dl, _uv - vec2(texSize.x, 0.0));

    float horizontalEdgeRight = abs((2.0*dr - dr2) - _depth);
    float horizontalEdgeLeft = abs((2.0*dl - dl2) - _depth);
    vec3 deltaX = horizontalEdgeRight < horizontalEdgeLeft ? ddx : ddx2;

    //find best depth along y...
    float dt = texelFetch(tDepth, uv + ivec2(0, 1), 0).x;
    float dt2 = texelFetch(tDepth, uv + ivec2(0, 2), 0).x;
    float db = texelFetch(tDepth, uv - ivec2(0, 1), 0).x;
    float db2 = texelFetch(tDepth, uv - ivec2(0, 2), 0).x;

    vec3 ddy = uvToEyePos(dt, _uv + vec2(0.0, texSize.y)) - posEye;
    vec3 ddy2 = posEye - uvToEyePos(db, _uv - vec2(0.0, texSize.y));

    float verticalEdgeTop = abs((2.0 * dt - dt2) - _depth);
    float verticalEdgeBottom = abs((2.0 * db - db2) - _depth);

    vec3 deltaY = verticalEdgeTop < verticalEdgeBottom ? ddy : ddy2;

    return normalize(cross(deltaX, deltaY));
}
{@}deNoiseSSAO.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tDepth;
uniform vec2 uDirection;
uniform float uDepthSigma;

uniform float uSpatialSigma;
uniform float uNormalSigma;


#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = vec4(position, 1.0);
    vUv = uv;
}

#!SHADER: Fragment
#define BILATERAL_BLUR

#define PI 3.14159265359
#define TAU 3.14159265359 * 2.0

float gaussianWeight(in float sigma, in float x) {
    float sigma2 = sigma * sigma;
    return exp(-(x * x) / (2.0 * sigma2));
}

void main() {

    float result = 0.0;
    vec2 texel = (floor(vUv * resolution.xy) + 0.5) / resolution.xy;
    vec2 aoDepthP = texelFetch(tMap, ivec2(texel * resolution.xy), 0).xy;
    vec3 normP = texelFetch(tDepth, ivec2(texel * resolution.xy), 0).xyz;

    #ifdef BILATERAL_BLUR

    if (abs(aoDepthP.y) >= (1000.0 - 0.1)) {
        gl_FragColor = vec4(aoDepthP, 0.0, 1.0);
        return;
    }

    vec2 blurDirection = uDirection * (1.0 / resolution.xy);
    float wsum = 0.0;
    float filterRadius = 5.0;
    float spatialWeight = 0.0;
    float normWeight = 0.0;
    float rangeWeight = 0.0;

    for(float x=-filterRadius; x<=filterRadius; x+=1.0) {

        vec2 offset = blurDirection * x;
        vec2 coord = texel + offset;
        vec2 aoDepthQ = texelFetch(tMap, ivec2(coord * resolution.xy), 0).xy;
        vec3 normQ = texelFetch(tDepth, ivec2(coord * resolution.xy), 0).xyz;

        spatialWeight = gaussianWeight(uSpatialSigma, abs(x));
        rangeWeight = gaussianWeight(uDepthSigma, abs(aoDepthQ.y - aoDepthP.y));
//        normWeight = gaussianWeight(uNormalSigma, 1.0 - dot(normP, normQ));
        normWeight =  max(0.0, dot(normP, normQ));
        result += aoDepthQ.x * spatialWeight * rangeWeight * normWeight;
        wsum += spatialWeight * rangeWeight * normWeight;

    }

    if(wsum > 0.0) {
        result /= wsum;
    } else {
        result = aoDepthP.x;
    }

    gl_FragColor = vec4(result, aoDepthP.y, 0.0, 1.0);

    #else

    float weight = 0.0;

    for(float i = -2.0; i < 2.0; i++) {
        for(float j = -2.0; j < 2.0; j++) {
            vec2 coord = vUv + (vec2(j, i) * (1.0/resolution.xy));
            result += texture2D(tMap, coord).x;
        }
    }

    result /= 16.0;
    gl_FragColor = vec4(result, aoDepthP.y, 0.0, 1.0);
    #endif
}
{@}depthDownNormalCalc.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tDepth;
uniform sampler2D tNormals;
uniform vec2 uResolution;
uniform vec2 uCameraNearFar;
uniform vec3 uFrustum;

uniform mat4 uInverseProjectionMatrix;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = vec4(position, 1.0);
    vUv = uv;
}

#!SHADER: Fragment
#require(depthvalue.fs)
//    #define USE_CHECKERBOARD_DEPTH

//if we trivialy accept differences between depths, there can be cases
//where the shortest difference does not belong to the same edge, and because of that
//a second depth is used to extrapolate the nearest depth value.
//points that are on the same surface should (based on the diagram) more or less
//end up at the same depth as the sampled one.
//this is explained here: https://atyuwen.github.io/posts/normal-reconstruction/

vec3 calcNormalFromDepth(in float _depth, in vec2 _uv) {
    vec2 texSize = 1.0 / uResolution;
    ivec2 uv = ivec2(_uv * uResolution);

    if (abs(_depth) >= 1.0) {
        return vec3(0.0);
    }

    vec3 posEye = eyePosFromDepth(_depth, 0.1, 1000.0, _uv * uResolution, false);

    //find best depth along x...
    float dr = texelFetch(tDepth, uv + ivec2(1, 0), 0).x;
    float dr2 = texelFetch(tDepth, uv + ivec2(2, 0), 0).x;
    float dl = texelFetch(tDepth, uv - ivec2(1, 0), 0).x;
    float dl2 = texelFetch(tDepth, uv - ivec2(2, 0), 0).x;

    vec3 ddx = eyePosFromDepth(dr, 0.1, 1000.0, (_uv + vec2(texSize.x, 0.0))*uResolution, false) - posEye;
    vec3 ddx2 = posEye - eyePosFromDepth(dl, 0.1, 1000.0, (_uv - vec2(texSize.x, 0.0)) * uResolution, false);

    float horizontalEdgeRight = abs((2.0*dr - dr2) - _depth);
    float horizontalEdgeLeft = abs((2.0*dl - dl2) - _depth);
    vec3 deltaX = horizontalEdgeRight < horizontalEdgeLeft ? ddx : ddx2;

    //find best depth along y...
    float dt = texelFetch(tDepth, uv + ivec2(0, 1), 0).x;
    float dt2 = texelFetch(tDepth, uv + ivec2(0, 2), 0).x;
    float db = texelFetch(tDepth, uv - ivec2(0, 1), 0).x;
    float db2 = texelFetch(tDepth, uv - ivec2(0, 2), 0).x;

    vec3 ddy = eyePosFromDepth(dt, 0.1, 1000.0, (_uv + vec2(0.0, texSize.y)) * uResolution, false) - posEye;
    vec3 ddy2 = posEye - eyePosFromDepth(db, 0.1, 1000.0, (_uv - vec2(0.0, texSize.y)) * uResolution, false);

    float verticalEdgeTop = abs((2.0 * dt - dt2) - _depth);
    float verticalEdgeBottom = abs((2.0 * db - db2) - _depth);

    vec3 deltaY = verticalEdgeTop < verticalEdgeBottom ? ddy : ddy2;

    return normalize(cross(deltaX, deltaY));
}

void main() {

    vec2 texel = (floor(vUv * uResolution) + 0.5) / uResolution;
    vec2 texSize = 1.0 / uResolution;

    vec2 desiredCoord = vec2(0.0);

    vec2 bl = texel;
    vec2 br = texel + vec2(texSize.x, 0.0);
    vec2 tl = texel + vec2(0.0, texSize.y);
    vec2 tr = texel + vec2(texSize);

    ivec2 fullResCoord = ivec2(vUv * uResolution);
    float bld = texelFetch(tDepth, fullResCoord, 0).x;
    float brd = texelFetch(tDepth, fullResCoord + ivec2(1, 0), 0).x;
    float tld = texelFetch(tDepth, fullResCoord + ivec2(0, 1), 0).x;
    float trd = texelFetch(tDepth, fullResCoord + ivec2(1, 1), 0).x;

    float depth;
    float maxDepth = max(max(bld, brd), max(tld, trd));

    #ifdef USE_CHECKERBOARD_DEPTH
        float minDepth = min(min(bld, brd), min(tld, trd));
        depth = mix(maxDepth, minDepth, float(int(gl_FragCoord.x) & 1 * int(gl_FragCoord.y) & 1));
    #else
        depth = maxDepth;
    #endif

    int index = 0;
    float[] samples = float[4](bld, brd, tld, trd);
    vec2[] coords = vec2[4](bl, br, tl, tr);
    for(int i = 0; i < 4; ++i) {
        if (samples[i] == depth) {
            index = i;
            break;
        }
    }
    vec3 normal = calcNormalFromDepth(samples[index], coords[index]);
//    vec3 normal = calcNormalFromDepth(samples[0], coords[0]);
    gl_FragColor = vec4(normal, getEyeZ(samples[index], 0.1, 1000.0));

}
{@}ssaoplus.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tNormal;
uniform sampler2D tRotations;
uniform sampler2D tBlueNoise;
uniform vec3[24] uSampleOffsets;
uniform vec3 uFrustum;

uniform float uSampleRadius;
uniform float uBias;
uniform float uIntensity;
uniform float uContrast;
uniform float uProjectionScale;

uniform float uTau;
uniform float uQuality;
uniform mat4 uInverseProjectionMatrix;

uniform vec2 uCameraNearFar;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = vec4(position, 1.0);
    vUv = uv;
}

#!SHADER: Fragment
#require(depthvalue.fs)
#require(tridither.glsl)

//#define USE_BLUE_NOISE
//#define USE_PROJECTED_OFFSET
#define PI 3.14159265359
#define TAU 3.14159265359 * 2.0

float alchemyHash(in vec2 c) {
    ivec2 iC = ivec2(c);
    return float(30 * iC.x ^ iC.y + iC.x * iC.y * 10);
}

vec2 getSampleOffset(in float i, in vec2 coord, in float r, float omega) {
    float alpha = (i + 0.5) * (1.0/uQuality);
    float hPrime = r * alpha;
    float turn = floor(uTau);
    float theta = alpha * (TAU * turn) + omega;
    return vec2(cos(theta), sin(theta)) * hPrime;
}

//sources:
//https://casual-effects.com/research/McGuire2011AlchemyAO/VV11AlchemyAO.pdf
//https://casual-effects.com/research/McGuire2012SAO/index.html
//https://learnopengl.com/Advanced-Lighting/SSAO

void main() {
    //vec2 coord = (floor(vUv * resolution.xy) + 0.5) / resolution.xy;
    vec2 coord = gl_FragCoord.xy;
    vec4 normalDepth = texelFetch(tNormal, ivec2(coord + 0.5), 0);
    vec3 normal = normalDepth.xyz;
    float depth = normalDepth.w;

    if (abs(depth) >= (uCameraNearFar.y - uCameraNearFar.x)) {
        gl_FragColor = vec4(1.0, depth, 0.0, 1.0);
        return;
    }

    vec3 viewPos = eyePosFromDepth(depth, uCameraNearFar.x, uCameraNearFar.y, coord, true);

    vec3 rVec;
    #ifdef USE_BLUE_NOISE
        rVec = vec3(2.0 * texture2D(tBlueNoise, gl_FragCoord.xy / 64.0) - 1.0) * vec3(1.0, 1.0, 0.0);
    #else
        rVec = normalize(texture2D(tRotations, gl_FragCoord.xy / 4.0).xyz);
    #endif

    #ifdef USE_PROJECTED_OFFSET

        vec3 tangent = normalize(rVec - (normal * dot(rVec, normal)));
        vec3 bitangent = cross(normal, tangent);
        mat3 tbn = mat3(tangent, bitangent, normal);

    #endif

    float occluded = 0.0;

    float quality = uQuality;
    float sampleRadius = -uSampleRadius * uProjectionScale / viewPos.z;
    float radius2 = uSampleRadius * uSampleRadius;
    float omega = alchemyHash(coord);

    for (float i = 0.0; i < quality; i++) {

        #ifdef USE_PROJECTED_OFFSET

            vec3 sampleDirection = tbn * uSampleOffsets[int(i)];
            vec3 samplePos = viewPos + sampleDirection * sampleRadius;
            vec4 offset = projectionMatrix * vec4(samplePos, 1.0);
            offset.xyz /= offset.w;
            offset.xyz = offset.xyz * 0.5 + 0.5;
            offset.xy = (floor(offset.xy * resolution.xy) + 0.5) / resolution.xy;

            vec3 sampledPos = uvToEyePos(texelFetch(tNormal, ivec2(offset.xy * resolution.xy), 0).w, offset.xy);

        #else

            vec2 sampleOffset = getSampleOffset(i, coord, sampleRadius, omega);
            vec2 c = coord + sampleOffset;
            vec3 sampledPos = eyePosFromDepth(texelFetch(tNormal, ivec2(c+0.5), 0).w, uCameraNearFar.x, uCameraNearFar.y, c, true);

        #endif

        vec3 delta = sampledPos - viewPos;
        float nDotv = dot(delta, normal);
        float eps = 0.01;
        float denom = dot(delta, delta);

        float f = max(radius2 - denom, 0.0);
        //float bias = viewPos.z * uBias * 0.01;
        float bias = uBias * 0.01;
        occluded += max(0.0, (nDotv - bias) / (denom + eps)) * f * f * f;
    }

    float tmp = radius2 * uSampleRadius;
    occluded /= tmp * tmp;

    float a = pow(max(0.0, 1.0 - (((2.0 * uIntensity) / quality) * occluded)), uContrast);
//    gl_FragColor = vec4(a, getDepthValue(depth, uCameraNearFar.x, uCameraNearFar.y), 0.0 , 1.0);
//    a = dither1(a, gl_FragCoord.xy, time);
    gl_FragColor = vec4(a, depth, 0.0 , 1.0);

}

{@}upSampleSSAO.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tMap;
uniform sampler2D tDepth;
uniform vec2 uDownSampledDepthResolution;
uniform vec2 uCameraNearFar;
uniform float uSigma;

#!VARYINGS
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = vec4(position, 1.0);
    vUv = uv;
}

#!SHADER: Fragment
#require(depthvalue.fs)
//#define BILTERIAL_UPSAMPLE


float gaussianWeight(in float sigma, in float x) {
    float sigma2 = sigma * sigma;
    return exp(-(x * x) / (2.0 * sigma2));
}

void main() {
    vec2 depthCoord = floor(vUv * uDownSampledDepthResolution)/uDownSampledDepthResolution;
    vec2 desiredCoord = vec2(0.0);
    vec2 texSizeDepth = vec2(1.0 / uDownSampledDepthResolution.xy);
    vec2 texSize = vec2(1.0 / resolution.xy);

    float col = 0.0;

    vec2[4] coords;
    coords[0] = depthCoord;
    coords[1] = depthCoord + vec2(texSizeDepth.x, 0.0);
    coords[2] = depthCoord + vec2(0.0, texSizeDepth.y);
    coords[3] = depthCoord + vec2(texSizeDepth);

    vec2 fullResDepthCoord = floor(vUv * resolution.xy)/resolution.xy;
    float currentDepth = getEyeZ(texelFetch(tDepth, ivec2(gl_FragCoord.xy), 0).x, uCameraNearFar.x, uCameraNearFar.y);

    float[4] distances;
    distances[0] = abs(currentDepth - texelFetch(tMap, ivec2(coords[0]), 0).y);
    distances[1] = abs(currentDepth - texelFetch(tMap, ivec2(coords[1]), 0).y);
    distances[2] = abs(currentDepth - texelFetch(tMap, ivec2(coords[2]), 0).y);
    distances[3] = abs(currentDepth - texelFetch(tMap, ivec2(coords[3]), 0).y);

    #ifdef BILTERIAL_UPSAMPLE

    vec2 bfCoord = vUv * uDownSampledDepthResolution - 0.5;
    vec2 fCoord = fract(bfCoord);
    bfCoord = (floor(bfCoord) + 0.5) / uDownSampledDepthResolution;

    float a = texture2D(tMap, bfCoord).x;
    float b = texture2D(tMap, bfCoord + vec2(texSizeDepth.x, 0.0)).x;
    float c = texture2D(tMap, bfCoord + vec2(0.0, texSizeDepth.y)).x;
    float d = texture2D(tMap, bfCoord + texSizeDepth).x;

    float weightA = gaussianWeight(uSigma, distances[0]);
    float weightB = gaussianWeight(uSigma, distances[1]);
    float weightC = gaussianWeight(uSigma, distances[2]);
    float weightD = gaussianWeight(uSigma, distances[3]);

    col = mix(mix(a * weightA, b * weightB, fCoord.x), mix(c * weightC, d * weightD, fCoord.x), fCoord.y);

    #else

    //bilinearly sample SSAO texture if all depth samples are more or less on the same surface
    float depthThreshold = 0.0001;

    if( distances[0] < depthThreshold &&
    distances[1] < depthThreshold &&
    distances[2] < depthThreshold &&
    distances[3] < depthThreshold
    ) {

        vec2 bfCoord = vUv * uDownSampledDepthResolution - 0.5;
        vec2 fCoord = fract(bfCoord);
        bfCoord = (floor(bfCoord) + 0.5) / uDownSampledDepthResolution;

        float a = texture2D(tMap, bfCoord).x;
        float b = texture2D(tMap, bfCoord + vec2(texSizeDepth.x, 0.0)).x;
        float c = texture2D(tMap, bfCoord + vec2(0.0, texSizeDepth.y)).x;
        float d = texture2D(tMap, bfCoord + texSizeDepth).x;

        col = mix(mix(a, b, fCoord.x), mix(c, d, fCoord.x), fCoord.y);

    } else {

        float minDist = distances[0];
        desiredCoord = coords[0];

        if(distances[1] < minDist) {
            minDist = distances[1];
            desiredCoord = coords[1];
        }

        if(distances[2] < minDist) {
            minDist = distances[2];
            desiredCoord = coords[2];
        }

        if(distances[3] < minDist) {
            minDist = distances[3];
            desiredCoord = coords[3];
        }

        col = texture2D(tMap, desiredCoord).x;

    }

    #endif

    gl_FragColor = vec4(col, 0.0, 0.0, 1.0);
}

{@}worldposdebug.glsl{@}#!ATTRIBUTES

#!UNIFORMS
uniform sampler2D tDepth;
uniform vec3 uFrustum;
uniform vec2 uCameraNearFar;

#!VARYINGS
varying vec3 vRay;
varying vec2 vUv;

#!SHADER: Vertex
void main() {
    gl_Position = vec4(position, 1.0);
    //vRay = (inverse(mat3(viewMatrix)) * vec3(position.xy, -1.0) * uFrustum);
//    vec4 r = inverse(projectionMatrix) * vec4(position.xy, 1.0, 1.0);
//    r /= r.w;
//    vRay = r.xyz;
    //vRay = (viewMatrix[0].xyz * uFrustum.x * position.x) + (viewMatrix[1].xyz * uFrustum.y * position.y) + (viewMatrix[3].xyz * uCameraNearFar.y);
    vRay = mat3(viewMatrix) * vec3(position.xy, -1.0) * uFrustum;
    vUv = uv;
}

#!SHADER: Fragment
#require(depthvalue.fs)

vec3 uvToEye(in sampler2D depth, in vec2 uv) {
    vec4 mvPos = inverse(projectionMatrix) * vec4(2.0 * uv - 1.0, 2.0 * texture2D(depth, uv).x - 1.0, 1.0);
    mvPos /= mvPos.w;
    return mvPos.xyz;
}

vec3 uvToEye(in float depth, in vec2 uv) {
    vec4 mvPos = inverse(projectionMatrix) * vec4(2.0 * uv - 1.0, 2.0 * depth - 1.0, 1.0);
    mvPos /= mvPos.w;
    return mvPos.xyz;
}

float LinearizeDepth(float depth, float near, float far)
{
    float z = depth * 2.0 - 1.0; // back to NDC
    return (2.0 * near * far) / (far + near - z * (far - near));
}

void main() {

//    float linearDepth = getDepthValue(texelFetch(tDepth, ivec2(gl_FragCoord.xy + 0.5), 0).x, uCameraNearFar.x, uCameraNearFar.y);
    float linearDepth = LinearizeDepth(texelFetch(tDepth, ivec2(gl_FragCoord.xy + 0.5), 0).x, uCameraNearFar.x, uCameraNearFar.y);
    //vec3 worldPos = (vec3(2.0 * vUv - 1.0, -1.0) * uFrustum * linearDepth);
    float x = (1.0 - projectionMatrix[2][0]) / projectionMatrix[0][0] - (2.0 * (gl_FragCoord.x + 0.5) / (resolution.x * projectionMatrix[0][0]));
    float y = (1.0 + projectionMatrix[2][1]) / projectionMatrix[1][1] - (2.0 * (gl_FragCoord.y + 0.5) / (resolution.y * projectionMatrix[1][1]));


    gl_FragColor = vec4(vec2(x,y)*-linearDepth, -linearDepth, 1.0);
//    gl_FragColor = vec4(uvToEye(tDepth, vUv), 1.0);
}
{@}Text3D.glsl{@}#!ATTRIBUTES
attribute vec3 animation;

#!UNIFORMS
uniform sampler2D tMap;
uniform vec3 uColor;
uniform float uAlpha;
uniform float uOpacity;
uniform vec3 uTranslate;
uniform vec3 uRotate;
uniform float uTransition;
uniform float uWordCount;
uniform float uLineCount;
uniform float uLetterCount;
uniform float uByWord;
uniform float uByLine;
uniform float uPadding;
uniform vec3 uBoundingMin;
uniform vec3 uBoundingMax;

#!VARYINGS
varying float vTrans;
varying vec2 vUv;
varying vec3 vPos;
varying vec3 vWorldPos;

#!SHADER: Vertex

#require(range.glsl)
#require(eases.glsl)
#require(rotation.glsl)
#require(conditionals.glsl)

void main() {
    vUv = uv;
    vTrans = 1.0;

    vec3 pos = position;

    if (uTransition > 0.0 && uTransition < 1.0) {
        float padding = uPadding;
        float letter = (animation.x + 1.0) / uLetterCount;
        float word = (animation.y + 1.0) / uWordCount;
        float line = (animation.z + 1.0) / uLineCount;

        float letterTrans = rangeTransition(uTransition, letter, padding);
        float wordTrans = rangeTransition(uTransition, word, padding);
        float lineTrans = rangeTransition(uTransition, line, padding);

        vTrans = mix(cubicOut(letterTrans), cubicOut(wordTrans), uByWord);
        vTrans = mix(vTrans, cubicOut(lineTrans), uByLine);

        float invTrans = (1.0 - vTrans);
        vec3 nRotate = normalize(uRotate);
        vec3 axisX = vec3(1.0, 0.0, 0.0);
        vec3 axisY = vec3(0.0, 1.0, 0.0);
        vec3 axisZ = vec3(0.0, 0.0, 1.0);
        vec3 axis = mix(axisX, axisY, when_gt(nRotate.y, nRotate.x));
        axis = mix(axis, axisZ, when_gt(nRotate.z, nRotate.x));
        pos = vec3(vec4(position, 1.0) * rotationMatrix(axis, radians(max(max(uRotate.x, uRotate.y), uRotate.z) * invTrans)));
        pos += uTranslate * invTrans;
    }

    vPos = pos;
	vWorldPos = vec3(modelMatrix * vec4(pos, 1.0));

    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}

#!SHADER: Fragment

#require(range.glsl)
#require(msdf.glsl)
#require(simplenoise.glsl)

vec2 getBoundingUV() {
    vec2 uv;
    uv.x = crange(vPos.x, uBoundingMin.x, uBoundingMax.x, 0.0, 1.0);
    uv.y = crange(vPos.y, uBoundingMin.y, uBoundingMax.y, 0.0, 1.0);
    return uv;
}

void main() {
    float alpha = msdf(tMap, vUv);

    //float noise = 0.5 + smoothstep(-1.0, 1.0, cnoise(vec3(vUv*50.0, time* 0.3))) * 0.5;

    gl_FragColor.rgb = uColor;
    gl_FragColor.a = alpha * uAlpha * uOpacity * vTrans;
}
{@}TweenUILPathFallbackShader.glsl{@}#!ATTRIBUTES
attribute float speed;

#!UNIFORMS
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uOpacity;

#!VARYINGS
varying vec3 vColor;

#!SHADER: Vertex

void main() {
    vColor = mix(uColor, uColor2, speed);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}

#!SHADER: Fragment
void main() {
    gl_FragColor = vec4(vColor, uOpacity);
}
{@}TweenUILPathShader.glsl{@}#!ATTRIBUTES
attribute float speed;

#!UNIFORMS
uniform vec3 uColor2;

#!VARYINGS

#!SHADER: Vertex

void main() {
    vColor = mix(uColor, uColor2, speed);
}

void customDirection() {
    // Use screen space coordinates for final position, so line thickness is
    // independent of camera.
    finalPosition = vec4(currentP.x / aspect, currentP.y, min(0.0, finalPosition.z), 1.0);
}

#!SHADER: Fragment
float tri(float v) {
    return mix(v, 1.0 - v, step(0.5, v)) * 2.0;
}

void main() {
    float signedDist = tri(vUv.y) - 0.5;
    gl_FragColor.a *= clamp(signedDist/fwidth(signedDist) + 0.5, 0.0, 1.0);
}
{@}spritesheetUV.glsl{@}#require(uvgrid.glsl)

vec2 spritesheetUV(vec2 uv, float gridTime, float gridWidth, float gridHeight, float loop) {
    float size = gridWidth * gridHeight;
    float index = gridTime * size;

    if (loop > 0.5) {
        index = mod(gridTime * size, size);
    }
    
    index = floor(index);

    float xOffset = mod(index, gridWidth);
    float yOffset = floor(index / gridHeight); 

    yOffset = gridHeight - 1.0 - yOffset;

    return getUVForGrid(uv, gridWidth, gridHeight, xOffset, yOffset);
}
