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

  describe('FP64', () => {
    let fp64;

    beforeEach(() => {
      fp64 = new FloatingPoint(1, 11, 52);
    });

    test('has correct properties', () => {
      expect(fp64.totalBits).toBe(64);
      expect(fp64.bias).toBe(1023);
      expect(fp64.maxExponent).toBe(2047);
    });

    test('encodes and decodes 1.0', () => {
      const encoded = fp64.encode(1.0);
      expect(encoded.sign).toBe(0);
      expect(encoded.exponent).toBe(1023);
      expect(encoded.mantissa).toBe(0);

      const decoded = fp64.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBe(1.0);
    });

    test('round-trip preserves high-precision value', () => {
      const value = 3.141592653589793;
      const encoded = fp64.encode(value);
      const decoded = fp64.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBe(value);
    });

    test('handles special values', () => {
      const nan = fp64.encode(NaN);
      expect(nan.isNaN).toBe(true);

      const inf = fp64.encode(Infinity);
      expect(inf.isInfinite).toBe(true);
    });
  });

  describe('TF32', () => {
    let tf32;

    beforeEach(() => {
      tf32 = new FloatingPoint(1, 8, 10);
    });

    test('has correct properties', () => {
      expect(tf32.totalBits).toBe(19);
      expect(tf32.bias).toBe(127);
      expect(tf32.maxExponent).toBe(255);
    });

    test('encodes and decodes 1.0', () => {
      const encoded = tf32.encode(1.0);
      expect(encoded.sign).toBe(0);
      expect(encoded.exponent).toBe(127);
      expect(encoded.mantissa).toBe(0);

      const decoded = tf32.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBe(1.0);
    });

    test('has same exponent range as FP32 but more precision than BF16', () => {
      // TF32 has 10 mantissa bits (like FP16) but 8 exponent bits (like FP32/BF16)
      const encoded = tf32.encode(1.001953125); // 1 + 2^-9 (representable in 10 mantissa bits)
      const decoded = tf32.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBe(1.001953125);
    });
  });

  describe('FP8 E8M0', () => {
    let fp8;

    beforeEach(() => {
      fp8 = new FloatingPoint(0, 8, 0);
    });

    test('has correct properties', () => {
      expect(fp8.totalBits).toBe(8);
      expect(fp8.signBits).toBe(0);
      expect(fp8.exponentBits).toBe(8);
      expect(fp8.mantissaBits).toBe(0);
      expect(fp8.bias).toBe(127);
    });

    test('encodes and decodes 1.0', () => {
      const encoded = fp8.encode(1.0);
      expect(encoded.exponent).toBe(127);
      expect(encoded.mantissa).toBe(0);

      const decoded = fp8.decode(0, 127, 0);
      expect(decoded).toBe(1.0);
    });

    test('encodes powers of two', () => {
      const encoded2 = fp8.encode(2.0);
      expect(fp8.decode(0, encoded2.exponent, 0)).toBe(2.0);

      const encoded05 = fp8.encode(0.5);
      expect(fp8.decode(0, encoded05.exponent, 0)).toBe(0.5);
    });

    test('decodes normal value with 0 mantissa bits', () => {
      // Normal number: 1.0 * 2^(exp - 127)
      const decoded = fp8.decode(0, 130, 0);
      expect(decoded).toBe(8.0); // 2^3
    });

    test('decodes subnormal with 0 mantissa bits', () => {
      // Subnormal with 0 mantissa bits: mantissaValue is 0
      const decoded = fp8.decode(0, 0, 0);
      expect(decoded).toBe(0);
    });

    test('handles max exponent without special values fallthrough', () => {
      // FP8_E8M0 has hasInfinity=true, hasNaN=true by default
      // maxExponent=255, mantissa=0 → Infinity
      const decoded = fp8.decode(0, 255, 0);
      expect(decoded).toBe(Infinity);
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
