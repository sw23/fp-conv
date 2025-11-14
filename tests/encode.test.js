// Import the FloatingPoint class from the pure math module
const { FloatingPoint, FORMATS } = require('../lib/floating-point.js');

describe('FloatingPoint encode()', () => {
  describe('Special Values', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('encodes positive zero correctly', () => {
      const result = fp32.encode(0);
      expect(result).toEqual({
        sign: 0,
        exponent: 0,
        mantissa: 0,
        isZero: true,
        isNormal: false,
        isSubnormal: false,
        isInfinite: false,
        isNaN: false
      });
    });

    test('encodes negative zero correctly', () => {
      const result = fp32.encode(-0);
      expect(result.sign).toBe(1);
      expect(result.exponent).toBe(0);
      expect(result.mantissa).toBe(0);
      expect(result.isZero).toBe(true);
    });

    test('encodes positive infinity', () => {
      const result = fp32.encode(Infinity);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(255);
      expect(result.mantissa).toBe(0);
      expect(result.isInfinite).toBe(true);
      expect(result.isNaN).toBe(false);
    });

    test('encodes negative infinity', () => {
      const result = fp32.encode(-Infinity);
      expect(result.sign).toBe(1);
      expect(result.exponent).toBe(255);
      expect(result.mantissa).toBe(0);
      expect(result.isInfinite).toBe(true);
    });

    test('encodes NaN', () => {
      const result = fp32.encode(NaN);
      expect(result.exponent).toBe(255);
      expect(result.mantissa).toBeGreaterThan(0);
      expect(result.isNaN).toBe(true);
    });
  });

  describe('Normal Numbers', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('encodes 1.0 correctly', () => {
      const result = fp32.encode(1.0);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(127); // bias
      expect(result.mantissa).toBe(0);
      expect(result.isNormal).toBe(true);
    });

    test('encodes -1.0 correctly', () => {
      const result = fp32.encode(-1.0);
      expect(result.sign).toBe(1);
      expect(result.exponent).toBe(127);
      expect(result.mantissa).toBe(0);
      expect(result.isNormal).toBe(true);
    });

    test('encodes 2.0 correctly', () => {
      const result = fp32.encode(2.0);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(128); // 127 + 1
      expect(result.mantissa).toBe(0);
      expect(result.isNormal).toBe(true);
    });

    test('encodes 0.5 correctly', () => {
      const result = fp32.encode(0.5);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(126); // 127 - 1
      expect(result.mantissa).toBe(0);
      expect(result.isNormal).toBe(true);
    });

    test('encodes smallest positive normal (2^-126)', () => {
      const minNormal = Math.pow(2, -126);
      const result = fp32.encode(minNormal);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(1);
      expect(result.mantissa).toBe(0);
      expect(result.isNormal).toBe(true);
      expect(result.isSubnormal).toBe(false);
    });

    test('encodes largest normal number', () => {
      // Largest normal: exponent = 254, all mantissa bits = 1
      const maxNormal = fp32.decode(0, 254, (1 << 23) - 1);
      const result = fp32.encode(maxNormal);
      expect(result.exponent).toBe(254);
      expect(result.mantissa).toBe((1 << 23) - 1);
      expect(result.isNormal).toBe(true);
    });
  });

  describe('Subnormal Numbers', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('encodes smallest subnormal (2^-149)', () => {
      const minSubnormal = Math.pow(2, -149);
      const result = fp32.encode(minSubnormal);
      expect(result.exponent).toBe(0);
      expect(result.mantissa).toBe(1);
      expect(result.isSubnormal).toBe(true);
      expect(result.isNormal).toBe(false);
    });

    test('encodes largest subnormal', () => {
      // Largest subnormal: just below smallest normal
      const maxSubnormal = Math.pow(2, -126) * (1 - Math.pow(2, -23));
      const result = fp32.encode(maxSubnormal);
      expect(result.exponent).toBe(0);
      expect(result.mantissa).toBe((1 << 23) - 1);
      expect(result.isSubnormal).toBe(true);
    });

    test('encodes mid-range subnormal', () => {
      const midSubnormal = Math.pow(2, -140);
      const result = fp32.encode(midSubnormal);
      expect(result.exponent).toBe(0);
      expect(result.isSubnormal).toBe(true);
      expect(result.mantissa).toBeGreaterThan(0);
    });
  });

  describe('Overflow', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('overflows to positive infinity for very large numbers', () => {
      const tooLarge = 1e39;
      const result = fp32.encode(tooLarge);
      expect(result.isInfinite).toBe(true);
      expect(result.sign).toBe(0);
    });

    test('overflows to negative infinity for very large negative numbers', () => {
      const tooLarge = -1e39;
      const result = fp32.encode(tooLarge);
      expect(result.isInfinite).toBe(true);
      expect(result.sign).toBe(1);
    });
  });
});
