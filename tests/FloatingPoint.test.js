// Import the FloatingPoint class from the pure math module
const { FloatingPoint, FORMATS } = require('../lib/floating-point.js');

describe('FloatingPoint', () => {
  describe('constructor', () => {
    test('initializes FP32 format correctly', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      expect(fp32.signBits).toBe(1);
      expect(fp32.exponentBits).toBe(8);
      expect(fp32.mantissaBits).toBe(23);
      expect(fp32.totalBits).toBe(32);
      expect(fp32.bias).toBe(127);
      expect(fp32.maxExponent).toBe(255);
    });

    test('initializes FP16 format correctly', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      expect(fp16.totalBits).toBe(16);
      expect(fp16.bias).toBe(15);
      expect(fp16.maxExponent).toBe(31);
    });

    test('handles fixed-point format (0 exponent bits)', () => {
      const fixed = new FloatingPoint(1, 0, 8);
      expect(fixed.bias).toBe(0);
      expect(fixed.maxExponent).toBe(0);
    });
  });

  describe('encode() - Special Values', () => {
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

  describe('encode() - Normal Numbers', () => {
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

  describe('encode() - Subnormal Numbers', () => {
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

  describe('encode() - Overflow', () => {
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

  describe('decode() - Special Values', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('decodes positive zero', () => {
      const result = fp32.decode(0, 0, 0);
      expect(result).toBe(0);
      expect(Object.is(result, 0)).toBe(true);
    });

    test('decodes negative zero', () => {
      const result = fp32.decode(1, 0, 0);
      expect(Object.is(result, -0)).toBe(true);
    });

    test('decodes positive infinity', () => {
      const result = fp32.decode(0, 255, 0);
      expect(result).toBe(Infinity);
    });

    test('decodes negative infinity', () => {
      const result = fp32.decode(1, 255, 0);
      expect(result).toBe(-Infinity);
    });

    test('decodes NaN', () => {
      const result = fp32.decode(0, 255, 1);
      expect(isNaN(result)).toBe(true);
    });
  });

  describe('decode() - Normal Numbers', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('decodes 1.0', () => {
      const result = fp32.decode(0, 127, 0);
      expect(result).toBe(1.0);
    });

    test('decodes -1.0', () => {
      const result = fp32.decode(1, 127, 0);
      expect(result).toBe(-1.0);
    });

    test('decodes 2.0', () => {
      const result = fp32.decode(0, 128, 0);
      expect(result).toBe(2.0);
    });

    test('decodes 0.5', () => {
      const result = fp32.decode(0, 126, 0);
      expect(result).toBe(0.5);
    });
  });

  describe('decode() - Subnormal Numbers', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('decodes smallest subnormal', () => {
      const result = fp32.decode(0, 0, 1);
      expect(result).toBeCloseTo(Math.pow(2, -149), 155);
    });

    test('decodes largest subnormal', () => {
      const result = fp32.decode(0, 0, (1 << 23) - 1);
      const expected = Math.pow(2, -126) * (1 - Math.pow(2, -23));
      expect(result).toBeCloseTo(expected, 10);
    });
  });

  describe('round-trip encode/decode', () => {
    let fp32;

    beforeEach(() => {
      fp32 = new FloatingPoint(1, 8, 23);
    });

    test('preserves exact values through round-trip', () => {
      const testValues = [0, 1, -1, 2, 0.5, 0.25, -3.5, 100, -200, 1e10, 1e-10];
      
      testValues.forEach(value => {
        const encoded = fp32.encode(value);
        const decoded = fp32.decode(encoded.sign, encoded.exponent, encoded.mantissa);
        expect(decoded).toBeCloseTo(value, 10);
      });
    });

    test('preserves special values through round-trip', () => {
      const testValues = [0, -0, Infinity, -Infinity, NaN];
      
      testValues.forEach(value => {
        const encoded = fp32.encode(value);
        const decoded = fp32.decode(encoded.sign, encoded.exponent, encoded.mantissa);
        
        if (isNaN(value)) {
          expect(isNaN(decoded)).toBe(true);
        } else if (Object.is(value, -0)) {
          expect(Object.is(decoded, -0)).toBe(true);
        } else {
          expect(decoded).toBe(value);
        }
      });
    });
  });

  describe('FP16 format tests', () => {
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

  describe('BF16 format tests', () => {
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

  describe('FP8 E4M3 format tests', () => {
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

  describe('FP8 E5M2 format tests', () => {
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

  describe('Fixed-point format (exponentBits = 0)', () => {
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

  describe('Cross-format conversions', () => {
    test('FP32 to FP16 conversion loses precision', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const value = 3.14159;
      const fp32Encoded = fp32.encode(value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      const loss = Math.abs(fp32Value - fp16Value);
      expect(loss).toBeGreaterThan(0);
      expect(loss).toBeLessThan(0.001);
    });

    test('FP32 to BF16 conversion loses mantissa precision', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const bf16 = new FloatingPoint(1, 8, 7);
      
      const value = 1.234567;
      const fp32Encoded = fp32.encode(value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const bf16Encoded = bf16.encode(fp32Value);
      const bf16Value = bf16.decode(bf16Encoded.sign, bf16Encoded.exponent, bf16Encoded.mantissa);
      
      // BF16 should maintain the same exponent but lose mantissa bits
      expect(fp32Encoded.exponent).toBe(bf16Encoded.exponent);
      expect(Math.abs(fp32Value - bf16Value)).toBeGreaterThan(0);
    });

    test('FP16 to FP8 conversion handles range reduction', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp8 = new FloatingPoint(1, 4, 3);
      
      const value = 5.0;
      const fp16Encoded = fp16.encode(value);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      const fp8Encoded = fp8.encode(fp16Value);
      const fp8Value = fp8.decode(fp8Encoded.sign, fp8Encoded.exponent, fp8Encoded.mantissa);
      
      // Should approximately preserve the value within FP8's limited range
      expect(Math.abs(fp16Value - fp8Value)).toBeLessThan(1.0);
    });
  });

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
  });

  describe('Edge cases and boundary conditions', () => {
    test('handles zero mantissa bits format', () => {
      const fp = new FloatingPoint(1, 8, 0);
      expect(fp.mantissaBits).toBe(0);
      
      const encoded = fp.encode(1.0);
      const decoded = fp.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBeCloseTo(1.0, 1);
    });

    test('handles very small exponent field', () => {
      const fp = new FloatingPoint(1, 2, 5);
      expect(fp.bias).toBe(1);
      expect(fp.maxExponent).toBe(3);
      
      const encoded = fp.encode(1.0);
      expect(encoded.exponent).toBeGreaterThan(0);
    });

    test('handles large mantissa field', () => {
      const fp = new FloatingPoint(1, 8, 52); // Similar to FP64
      const encoded = fp.encode(1.5);
      const decoded = fp.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBeCloseTo(1.5, 15);
    });
  });
});
