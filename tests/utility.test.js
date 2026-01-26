// Import the FloatingPoint class from the pure math module
const { FloatingPoint } = require('../lib/floating-point.js');

describe('FloatingPoint Utility Methods', () => {
  describe('toBinaryString()', () => {
    test('FP32 binary string for 1.0', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const binary = fp32.toBinaryString(0, 127, 0);
      expect(binary).toBe('0' + '01111111' + '00000000000000000000000');
      expect(binary.length).toBe(32);
    });

    test('FP16 binary string for -1.0', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const binary = fp16.toBinaryString(1, 15, 0);
      expect(binary).toBe('1' + '01111' + '0000000000');
      expect(binary.length).toBe(16);
    });

    test('handles format without sign bit', () => {
      const fp = new FloatingPoint(0, 8, 8);
      const binary = fp.toBinaryString(0, 127, 128);
      expect(binary).toBe('01111111' + '10000000');
      expect(binary.length).toBe(16);
    });
  });

  describe('toHexString()', () => {
    test('FP32 hex string for 1.0', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const hex = fp32.toHexString(0, 127, 0);
      expect(hex).toBe('0x3F800000');
    });

    test('FP16 hex string for 1.0', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const hex = fp16.toHexString(0, 15, 0);
      expect(hex).toBe('0x3C00');
    });

    test('FP8 hex string', () => {
      const fp8 = new FloatingPoint(1, 4, 3);
      const hex = fp8.toHexString(0, 7, 0);
      expect(hex).toBe('0x38');
    });
  });

  describe('getZero()', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('creates positive zero', () => {
      const result = fp32.getZero(false);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(0);
      expect(result.mantissa).toBe(0);
      expect(result.isZero).toBe(true);
    });

    test('creates negative zero', () => {
      const result = fp32.getZero(true);
      expect(result.sign).toBe(1);
      expect(result.isZero).toBe(true);
    });
  });

  describe('getInfinity()', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('creates positive infinity', () => {
      const result = fp32.getInfinity(false);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(255);
      expect(result.mantissa).toBe(0);
      expect(result.isInfinite).toBe(true);
    });

    test('creates negative infinity', () => {
      const result = fp32.getInfinity(true);
      expect(result.sign).toBe(1);
      expect(result.isInfinite).toBe(true);
    });
  });

  describe('getNaN()', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('creates NaN', () => {
      const result = fp32.getNaN();
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(255);
      expect(result.mantissa).toBeGreaterThan(0);
      expect(result.isNaN).toBe(true);
    });

    test('throws error when format does not support NaN', () => {
      const fp = new FloatingPoint(1, 4, 3, { hasNaN: false });
      expect(() => fp.getNaN()).toThrow('Format does not support NaN');
    });
  });

  describe('getMaxNormal()', () => {
    test('FP32 returns correct max normal', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const result = fp32.getMaxNormal(false);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(255); // maxExponent
      expect(result.mantissa).toBe((1 << 23) - 1);
      expect(result.isNormal).toBe(true);
      expect(result.isInfinite).toBe(false);
    });

    test('FP32 returns correct negative max normal', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const result = fp32.getMaxNormal(true);
      expect(result.sign).toBe(1);
      expect(result.isNormal).toBe(true);
    });

    test('FP16 returns correct max normal', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const result = fp16.getMaxNormal(false);
      expect(result.sign).toBe(0);
      expect(result.exponent).toBe(31); // maxExponent for FP16
      expect(result.mantissa).toBe((1 << 10) - 1);
      expect(result.isNormal).toBe(true);
    });

    test('OCP FP4 E2M1 max normal uses maxExponent (no infinity)', () => {
      const fp4 = new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false });
      const result = fp4.getMaxNormal(false);
      expect(result.exponent).toBe(3); // maxExponent
      expect(result.mantissa).toBe(1); // all mantissa bits set
      expect(result.isNormal).toBe(true);
      
      // Verify decoded value
      const decoded = fp4.decode(result.sign, result.exponent, result.mantissa);
      expect(decoded).toBe(6.0); // 2^(3-1) * 1.5 = 4 * 1.5 = 6
    });

    test('format without sign bit still accepts negative parameter', () => {
      const fp = new FloatingPoint(0, 8, 8);
      const result = fp.getMaxNormal(true); // negative requested
      // The function sets sign=1 even though format has no sign bit
      // This is consistent with how other methods work
      expect(result.sign).toBe(1);
      expect(result.isNormal).toBe(true);
    });
  });

  describe('getInfinity() error handling', () => {
    test('throws error when format does not support infinity', () => {
      const fp = new FloatingPoint(1, 4, 3, { hasInfinity: false });
      expect(() => fp.getInfinity()).toThrow('Format does not support Infinity');
    });
  });
});
