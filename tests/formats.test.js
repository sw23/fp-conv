// Import the FloatingPoint class from the pure math module
const { FloatingPoint } = require('../lib/floating-point.js');

describe('FloatingPoint Format Tests', () => {
  describe('FP16', () => {
    let fp16;

    beforeEach(() => {
      fp16 = new FloatingPoint(1, 5, 10);
    });

    test('has correct properties', () => {
      expect(fp16.totalBits).toBe(16);
      expect(fp16.bias).toBe(15);
      expect(fp16.maxExponent).toBe(31);
    });

    test('encodes and decodes 1.0', () => {
      const encoded = fp16.encode(1.0);
      expect(encoded.sign).toBe(0);
      expect(encoded.exponent).toBe(15); // bias
      expect(encoded.mantissa).toBe(0);
      
      const decoded = fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBe(1.0);
    });

    test('handles maximum normal value', () => {
      const maxNormal = fp16.decode(0, 30, (1 << 10) - 1);
      const encoded = fp16.encode(maxNormal);
      expect(encoded.exponent).toBe(30);
      expect(encoded.mantissa).toBe((1 << 10) - 1);
    });

    test('handles minimum subnormal value', () => {
      const minSubnormal = Math.pow(2, -24); // 2^(-14-10)
      const encoded = fp16.encode(minSubnormal);
      expect(encoded.exponent).toBe(0);
      expect(encoded.mantissa).toBe(1);
      expect(encoded.isSubnormal).toBe(true);
    });
  });

  describe('BF16', () => {
    let bf16;

    beforeEach(() => {
      bf16 = new FloatingPoint(1, 8, 7);
    });

    test('has correct properties', () => {
      expect(bf16.totalBits).toBe(16);
      expect(bf16.bias).toBe(127); // Same as FP32
      expect(bf16.maxExponent).toBe(255);
    });

    test('has same range as FP32 but less precision', () => {
      const encoded = bf16.encode(3.14159);
      const decoded = bf16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      
      // BF16 should lose precision compared to FP32
      expect(Math.abs(decoded - 3.14159)).toBeGreaterThan(0);
      expect(Math.abs(decoded - 3.14159)).toBeLessThan(0.01);
    });
  });

  describe('FP8 E4M3', () => {
    let fp8;

    beforeEach(() => {
      fp8 = new FloatingPoint(1, 4, 3);
    });

    test('has correct properties', () => {
      expect(fp8.totalBits).toBe(8);
      expect(fp8.bias).toBe(7);
      expect(fp8.maxExponent).toBe(15);
    });

    test('handles limited range', () => {
      const encoded = fp8.encode(1.0);
      const decoded = fp8.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBeCloseTo(1.0, 2);
    });

    test('handles maximum value', () => {
      const maxVal = fp8.decode(0, 14, 7);
      const encoded = fp8.encode(maxVal);
      expect(encoded.exponent).toBe(14);
      expect(encoded.mantissa).toBe(7);
    });
  });

  describe('FP8 E5M2', () => {
    let fp8;

    beforeEach(() => {
      fp8 = new FloatingPoint(1, 5, 2);
    });

    test('has correct properties', () => {
      expect(fp8.totalBits).toBe(8);
      expect(fp8.bias).toBe(15);
      expect(fp8.maxExponent).toBe(31);
    });

    test('has wider range but less precision than E4M3', () => {
      const encoded = fp8.encode(1.0);
      expect(encoded.exponent).toBe(15);
      
      const decoded = fp8.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBeCloseTo(1.0, 1);
    });
  });

  describe('Fixed-point (exponentBits = 0)', () => {
    let fixed;

    beforeEach(() => {
      fixed = new FloatingPoint(1, 0, 8);
    });

    test('has correct properties', () => {
      expect(fixed.totalBits).toBe(9);
      expect(fixed.bias).toBe(0);
      expect(fixed.exponentBits).toBe(0);
    });

    test('encodes fractional values', () => {
      const encoded = fixed.encode(0.5);
      expect(encoded.exponent).toBe(0);
      expect(encoded.mantissa).toBe(128); // 0.5 * 2^8
      expect(encoded.isNormal).toBe(false);
    });

    test('decodes fractional values', () => {
      const decoded = fixed.decode(0, 0, 128);
      expect(decoded).toBeCloseTo(0.5, 3);
    });

    test('handles zero', () => {
      const encoded = fixed.encode(0);
      expect(encoded.mantissa).toBe(0);
      expect(encoded.isZero).toBe(true);
      
      const decoded = fixed.decode(0, 0, 0);
      expect(decoded).toBe(0);
    });

    test('round-trip preserves values', () => {
      const testValues = [0, 0.25, 0.5, 0.75, 0.125, 0.875];
      
      testValues.forEach(value => {
        const encoded = fixed.encode(value);
        const decoded = fixed.decode(encoded.sign, encoded.exponent, encoded.mantissa);
        expect(decoded).toBeCloseTo(value, 3);
      });
    });
  });
});
