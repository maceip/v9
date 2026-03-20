// Math utilities extracted from Hydra framework
// Line ~59-100 from app.1715958947476.js

Math.sign = function(x) {
  x = +x;
  return x === 0 || isNaN(x) ? Number(x) : x > 0 ? 1 : -1;
};

Math._round = Math.round;
Math.round = function(value, precision = 0) {
  let p = Math.pow(10, precision);
  return Math._round(value * p) / p;
};

Math._random = Math.random;
Math.rand = Math.random = function(min = 0, max = 1, precision = 0) {
  if (arguments.length === 0) return Math._random();
  if (min === max) return min;
  if (precision === 0) return Math.floor(Math._random() * (max + 1 - min) + min);
  return Math.round(min + Math._random() * (max - min), precision);
};

Math.degrees = function(radians) {
  return radians * (180 / Math.PI);
};

Math.radians = function(degrees) {
  return degrees * (Math.PI / 180);
};

Math.clamp = function(value, min = 0, max = 1) {
  return Math.min(Math.max(value, Math.min(min, max)), Math.max(min, max));
};

Math.map = Math.range = function(value, oldMin = -1, oldMax = 1, newMin = 0, newMax = 1, isClamp) {
  const newValue = ((value - oldMin) * (newMax - newMin)) / (oldMax - oldMin) + newMin;
  return isClamp
    ? Math.clamp(newValue, Math.min(newMin, newMax), Math.max(newMin, newMax))
    : newValue;
};

Math.mix = function(a, b, alpha) {
  return a + (b - a) * alpha;
};

Math.framerateNormalizeLerpAlpha = function(alpha) {
  const refFramerate = 60;
  const currentFramerate = 60; // Assume 60fps for simplicity
  return 1 - Math.pow(1 - alpha, refFramerate / currentFramerate);
};

export { Math };
