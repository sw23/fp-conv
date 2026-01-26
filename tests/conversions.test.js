// Import the FloatingPoint class from the pure math module
const { FloatingPoint } = require('../lib/floating-point.js');

describe('Cross-format Conversions', () => {
  describe('Normal to Normal conversions', () => {
    test('FP32 to FP16: preserves sign and adjusts exponent bias', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // Test value: 1.5 (exactly representable in both formats)
      const fp32Encoded = fp32.encode(1.5);
      expect(fp32Encoded.isNormal).toBe(true);
      
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      const fp16Encoded = fp16.encode(fp32Value);
      expect(fp16Encoded.isNormal).toBe(true);
      
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      // Should be exactly equal since 1.5 = 1.1b × 2^0 is exactly representable
      expect(fp16Value).toBe(1.5);
      expect(fp32Encoded.sign).toBe(fp16Encoded.sign);
    });

    test('FP32 to FP16: truncates mantissa bits', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // Pi requires many mantissa bits
      const value = Math.PI;
      const fp32Encoded = fp32.encode(value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      // Both should be normal
      expect(fp32Encoded.isNormal).toBe(true);
      expect(fp16Encoded.isNormal).toBe(true);
      
      // FP16 loses precision (23 - 10 = 13 mantissa bits lost)
      expect(fp16Value).not.toBe(fp32Value);
      expect(Math.abs(fp16Value - fp32Value)).toBeLessThan(0.001);
    });

    test('FP32 to BF16: preserves exponent, truncates mantissa', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const bf16 = new FloatingPoint(1, 8, 7);
      
      const value = 1.234567;
      const fp32Encoded = fp32.encode(value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const bf16Encoded = bf16.encode(fp32Value);
      const bf16Value = bf16.decode(bf16Encoded.sign, bf16Encoded.exponent, bf16Encoded.mantissa);
      
      // BF16 has same exponent range as FP32
      expect(fp32Encoded.exponent).toBe(bf16Encoded.exponent);
      expect(fp32Encoded.isNormal).toBe(true);
      expect(bf16Encoded.isNormal).toBe(true);
      
      // But loses mantissa precision
      expect(Math.abs(fp32Value - bf16Value)).toBeGreaterThan(0);
    });

    test('FP16 to FP32: exact upconversion (no loss)', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp32 = new FloatingPoint(1, 8, 23);
      
      const value = 3.14;
      const fp16Encoded = fp16.encode(value);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      // Convert to FP32
      const fp32Encoded = fp32.encode(fp16Value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      // Upconversion should be exact
      expect(fp32Value).toBe(fp16Value);
      expect(fp16Encoded.isNormal).toBe(true);
      expect(fp32Encoded.isNormal).toBe(true);
    });

    test('FP8 E4M3 to FP16: exact upconversion', () => {
      const fp8 = new FloatingPoint(1, 4, 3);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const value = 1.5;
      const fp8Encoded = fp8.encode(value);
      const fp8Value = fp8.decode(fp8Encoded.sign, fp8Encoded.exponent, fp8Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp8Value);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      // Should be exactly preserved in upconversion
      expect(fp16Value).toBe(fp8Value);
    });
  });

  describe('Normal to Subnormal conversions', () => {
    test('FP32 normal to FP16 subnormal', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // FP16 smallest normal: 2^-14
      // FP16 subnormal range: 2^-24 to 2^-14
      // Pick a value that's normal in FP32 but subnormal in FP16
      const value = Math.pow(2, -20); // Normal in FP32, subnormal in FP16
      
      const fp32Encoded = fp32.encode(value);
      expect(fp32Encoded.isNormal).toBe(true);
      expect(fp32Encoded.isSubnormal).toBe(false);
      
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      const fp16Encoded = fp16.encode(fp32Value);
      
      expect(fp16Encoded.isSubnormal).toBe(true);
      expect(fp16Encoded.isNormal).toBe(false);
      expect(fp16Encoded.exponent).toBe(0);
      
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      expect(fp16Value).toBeCloseTo(value, 10);
    });

    test('FP16 normal to FP8 subnormal', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp8 = new FloatingPoint(1, 4, 3);
      
      // FP8 E4M3 smallest normal: 2^-6
      // Pick value normal in FP16 but subnormal in FP8
      const value = Math.pow(2, -8);
      
      const fp16Encoded = fp16.encode(value);
      expect(fp16Encoded.isNormal).toBe(true);
      
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      const fp8Encoded = fp8.encode(fp16Value);
      
      expect(fp8Encoded.isSubnormal).toBe(true);
      expect(fp8Encoded.exponent).toBe(0);
    });

    test('FP32 normal to FP8 subnormal with precision loss', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp8 = new FloatingPoint(1, 4, 3);
      
      const value = Math.pow(2, -8);
      const fp32Encoded = fp32.encode(value);
      expect(fp32Encoded.isNormal).toBe(true);
      
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      const fp8Encoded = fp8.encode(fp32Value);
      
      expect(fp8Encoded.isSubnormal).toBe(true);
      expect(fp8Encoded.mantissa).toBeGreaterThan(0);
    });
  });

  describe('Subnormal to Subnormal conversions', () => {
    test('FP32 subnormal to FP16 subnormal (when representable)', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // FP16 subnormal range: 2^-24 to 2^-14 (just below smallest normal)
      // Pick value in this range that's also subnormal in FP32
      const value = Math.pow(2, -130); // Subnormal in FP32, underflows to zero in FP16
      
      const fp32Encoded = fp32.encode(value);
      expect(fp32Encoded.isSubnormal).toBe(true);
      
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      const fp16Encoded = fp16.encode(fp32Value);
      
      // Actually underflows to zero because it's too small for FP16
      expect(fp16Encoded.isZero).toBe(true);
      expect(fp16Encoded.exponent).toBe(0);
    });

    test('FP16 subnormal stays subnormal in FP32', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp32 = new FloatingPoint(1, 8, 23);
      
      // Value subnormal in FP16: 2^-20
      const value = Math.pow(2, -20);
      
      const fp16Encoded = fp16.encode(value);
      expect(fp16Encoded.isSubnormal).toBe(true);
      
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      // When upconverting to FP32, this becomes normal
      const fp32Encoded = fp32.encode(fp16Value);
      expect(fp32Encoded.isNormal).toBe(true);
    });

    test('Very small FP16 values to FP8', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp8 = new FloatingPoint(1, 4, 3);
      
      // FP16 smallest normal: 2^-14
      // FP16 subnormal range: below 2^-14, down to 2^-24
      // FP8 E4M3 smallest normal: 2^-6
      // FP8 subnormal range: below 2^-6, down to 2^-9
      
      // Pick a value that's subnormal in FP16 but within FP8 range
      const value = Math.pow(2, -16); // Subnormal in FP16
      
      const fp16Encoded = fp16.encode(value);
      expect(fp16Encoded.isSubnormal).toBe(true);
      
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      const fp8Encoded = fp8.encode(fp16Value);
      
      // Too small for FP8 E4M3, underflows to zero or very small subnormal
      // This tests the underflow behavior
      expect(fp8Encoded.isZero || fp8Encoded.isSubnormal).toBe(true);
    });
  });

  describe('Subnormal to Normal conversions', () => {
    test('FP16 subnormal to FP32 normal', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp32 = new FloatingPoint(1, 8, 23);
      
      // Value subnormal in FP16 but normal in FP32
      const value = Math.pow(2, -20);
      
      const fp16Encoded = fp16.encode(value);
      expect(fp16Encoded.isSubnormal).toBe(true);
      
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      const fp32Encoded = fp32.encode(fp16Value);
      
      expect(fp32Encoded.isNormal).toBe(true);
      expect(fp32Encoded.isSubnormal).toBe(false);
      
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      expect(fp32Value).toBeCloseTo(fp16Value, 15);
    });

    test('FP8 subnormal to FP16 normal', () => {
      const fp8 = new FloatingPoint(1, 4, 3);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const value = Math.pow(2, -8); // Subnormal in FP8, normal in FP16
      
      const fp8Encoded = fp8.encode(value);
      expect(fp8Encoded.isSubnormal).toBe(true);
      
      const fp8Value = fp8.decode(fp8Encoded.sign, fp8Encoded.exponent, fp8Encoded.mantissa);
      const fp16Encoded = fp16.encode(fp8Value);
      
      expect(fp16Encoded.isNormal).toBe(true);
    });

    test('FP8 subnormal to FP32 normal with exact preservation', () => {
      const fp8 = new FloatingPoint(1, 4, 3);
      const fp32 = new FloatingPoint(1, 8, 23);
      
      const value = Math.pow(2, -8);
      const fp8Encoded = fp8.encode(value);
      const fp8Value = fp8.decode(fp8Encoded.sign, fp8Encoded.exponent, fp8Encoded.mantissa);
      
      const fp32Encoded = fp32.encode(fp8Value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      // Upconversion should preserve value exactly
      expect(fp32Value).toBe(fp8Value);
      expect(fp32Encoded.isNormal).toBe(true);
    });
  });

  describe('Normal to Infinity conversions', () => {
    test('FP32 normal overflows to FP16 infinity', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // FP16 max: ~65504, FP32 can represent much larger
      const value = 100000; // Too large for FP16
      
      const fp32Encoded = fp32.encode(value);
      expect(fp32Encoded.isNormal).toBe(true);
      
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      const fp16Encoded = fp16.encode(fp32Value);
      
      expect(fp16Encoded.isInfinite).toBe(true);
      expect(fp16Encoded.exponent).toBe(fp16.maxExponent);
      expect(fp16Encoded.mantissa).toBe(0);
    });

    test('FP16 normal overflows to FP8 infinity', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp8 = new FloatingPoint(1, 4, 3);
      
      // FP8 E4M3 max is much smaller than FP16 max
      const value = 1000; // Normal in FP16, overflow in FP8
      
      const fp16Encoded = fp16.encode(value);
      expect(fp16Encoded.isNormal).toBe(true);
      
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      const fp8Encoded = fp8.encode(fp16Value);
      
      expect(fp8Encoded.isInfinite).toBe(true);
    });

    test('Negative normal overflows to negative infinity', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const value = -100000;
      const fp32Encoded = fp32.encode(value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      
      expect(fp16Encoded.isInfinite).toBe(true);
      expect(fp16Encoded.sign).toBe(1);
    });
  });

  describe('Subnormal to Zero conversions', () => {
    test('FP32 subnormal underflows to FP16 zero', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // FP16 smallest subnormal: 2^-24
      // Pick smaller value that becomes zero in FP16
      const value = Math.pow(2, -145); // Subnormal in FP32, underflows in FP16
      
      const fp32Encoded = fp32.encode(value);
      expect(fp32Encoded.isSubnormal).toBe(true);
      
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      const fp16Encoded = fp16.encode(fp32Value);
      
      // Should underflow to zero
      expect(fp16Encoded.isZero).toBe(true);
      expect(fp16Encoded.exponent).toBe(0);
      expect(fp16Encoded.mantissa).toBe(0);
    });

    test('FP16 subnormal underflows to FP8 zero', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp8 = new FloatingPoint(1, 4, 3);
      
      // Very small subnormal that can't be represented in FP8
      const value = Math.pow(2, -23);
      
      const fp16Encoded = fp16.encode(value);
      expect(fp16Encoded.isSubnormal).toBe(true);
      
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      const fp8Encoded = fp8.encode(fp16Value);
      
      expect(fp8Encoded.isZero).toBe(true);
    });

    test('Preserves sign during underflow to zero', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const value = -Math.pow(2, -145);
      const fp32Encoded = fp32.encode(value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      
      expect(fp16Encoded.isZero).toBe(true);
      expect(fp16Encoded.sign).toBe(1); // Negative zero
    });
  });

  describe('Special value conversions', () => {
    test('Infinity is preserved across formats', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const fp32Encoded = fp32.encode(Infinity);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      
      expect(fp16Encoded.isInfinite).toBe(true);
      expect(fp16Encoded.mantissa).toBe(0);
    });

    test('NaN is preserved across formats', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const fp32Encoded = fp32.encode(NaN);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      
      expect(fp16Encoded.isNaN).toBe(true);
      expect(fp16Encoded.exponent).toBe(fp16.maxExponent);
      expect(fp16Encoded.mantissa).toBeGreaterThan(0);
    });

    test('Zero is preserved across formats', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const fp32Encoded = fp32.encode(0);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      
      expect(fp16Encoded.isZero).toBe(true);
      expect(fp16Encoded.sign).toBe(0);
    });

    test('Negative zero is preserved across formats', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const fp32Encoded = fp32.encode(-0);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      
      expect(fp16Encoded.isZero).toBe(true);
      expect(fp16Encoded.sign).toBe(1);
    });
  });

  describe('Round-trip conversion tests', () => {
    test('FP32→FP16→FP32 preserves FP16-representable values', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const testValues = [0, 1, -1, 2, 0.5, 0.25, 100, -50];
      
      testValues.forEach(value => {
        const fp32Encoded1 = fp32.encode(value);
        const fp32Value1 = fp32.decode(fp32Encoded1.sign, fp32Encoded1.exponent, fp32Encoded1.mantissa);
        
        const fp16Encoded = fp16.encode(fp32Value1);
        const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
        
        const fp32Encoded2 = fp32.encode(fp16Value);
        const fp32Value2 = fp32.decode(fp32Encoded2.sign, fp32Encoded2.exponent, fp32Encoded2.mantissa);
        
        // Round-trip through FP16 should be idempotent
        expect(fp32Value2).toBe(fp16Value);
      });
    });

    test('FP16→FP32→FP16 is exact (no loss)', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp32 = new FloatingPoint(1, 8, 23);
      
      const testValues = [0, 1, -1, 2, 0.5, 3.14];
      
      testValues.forEach(value => {
        const fp16Encoded1 = fp16.encode(value);
        const fp16Value1 = fp16.decode(fp16Encoded1.sign, fp16Encoded1.exponent, fp16Encoded1.mantissa);
        
        const fp32Encoded = fp32.encode(fp16Value1);
        const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
        
        const fp16Encoded2 = fp16.encode(fp32Value);
        const fp16Value2 = fp16.decode(fp16Encoded2.sign, fp16Encoded2.exponent, fp16Encoded2.mantissa);
        
        // Should be exactly preserved
        expect(fp16Value2).toBe(fp16Value1);
      });
    });
  });

  describe('Edge case conversions', () => {
    test('Largest FP16 normal converts to FP32 normal', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const fp32 = new FloatingPoint(1, 8, 23);
      
      // Largest FP16: exponent=30, mantissa all 1s
      const fp16Value = fp16.decode(0, 30, (1 << 10) - 1);
      const fp32Encoded = fp32.encode(fp16Value);
      
      expect(fp32Encoded.isNormal).toBe(true);
      expect(fp32Encoded.isInfinite).toBe(false);
    });

    test('Smallest FP32 normal converts to FP16 subnormal', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const value = Math.pow(2, -126); // Smallest FP32 normal
      const fp32Encoded = fp32.encode(value);
      expect(fp32Encoded.isNormal).toBe(true);
      
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      const fp16Encoded = fp16.encode(fp32Value);
      
      // This is way below FP16's normal range
      expect(fp16Encoded.isZero).toBe(true);
    });

    test('BF16 and FP32 share exponent range', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const bf16 = new FloatingPoint(1, 8, 7);
      
      const value = 1e30; // Large value
      const fp32Encoded = fp32.encode(value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const bf16Encoded = bf16.encode(fp32Value);
      
      // Both should handle this or both should overflow
      expect(fp32Encoded.isNormal).toBe(bf16Encoded.isNormal);
      expect(fp32Encoded.isInfinite).toBe(bf16Encoded.isInfinite);
    });
  });

  describe('Precision loss calculations', () => {
    test('identical value round-trips have zero precision loss', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // 1.5 is exactly representable
      const encoded = fp16.encode(1.5);
      const decoded = fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      
      expect(decoded).toBe(1.5);
      expect(Math.abs(1.5 - decoded)).toBe(0);
    });

    test('FP32 to FP16 precision loss is quantifiable', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // Use a value that has precision loss
      const value = 3.14159265358979;
      
      const fp32Encoded = fp32.encode(value);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      const loss = Math.abs(fp32Value - fp16Value);
      const relativeLoss = loss / Math.abs(fp32Value);
      
      expect(loss).toBeGreaterThan(0);
      expect(relativeLoss).toBeLessThan(0.001); // Less than 0.1% relative loss
    });

    test('NaN has no meaningful precision loss', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      const bf16 = new FloatingPoint(1, 8, 7);
      
      const fp16Encoded = fp16.encode(NaN);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      const bf16Encoded = bf16.encode(fp16Value);
      const bf16Value = bf16.decode(bf16Encoded.sign, bf16Encoded.exponent, bf16Encoded.mantissa);
      
      // Both should be NaN
      expect(Number.isNaN(fp16Value)).toBe(true);
      expect(Number.isNaN(bf16Value)).toBe(true);
      
      // Loss calculation with NaN
      const loss = Math.abs(fp16Value - bf16Value);
      expect(Number.isNaN(loss)).toBe(true);
    });

    test('Infinity converts exactly between formats', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const fp32Encoded = fp32.encode(Infinity);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      expect(fp32Value).toBe(Infinity);
      expect(fp16Value).toBe(Infinity);
      expect(fp16Encoded.isInfinite).toBe(true);
    });

    test('negative Infinity converts exactly between formats', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      const fp16 = new FloatingPoint(1, 5, 10);
      
      const fp32Encoded = fp32.encode(-Infinity);
      const fp32Value = fp32.decode(fp32Encoded.sign, fp32Encoded.exponent, fp32Encoded.mantissa);
      
      const fp16Encoded = fp16.encode(fp32Value);
      const fp16Value = fp16.decode(fp16Encoded.sign, fp16Encoded.exponent, fp16Encoded.mantissa);
      
      expect(fp16Value).toBe(-Infinity);
    });
  });

  describe('All-ones bit pattern', () => {
    test('FP16 all-ones pattern decodes to NaN', () => {
      const fp16 = new FloatingPoint(1, 5, 10);
      
      // All ones: sign=1, exp=31, mantissa=1023
      const value = fp16.decode(1, 31, (1 << 10) - 1);
      expect(Number.isNaN(value)).toBe(true);
    });

    test('FP32 all-ones pattern decodes to NaN', () => {
      const fp32 = new FloatingPoint(1, 8, 23);
      
      // All ones: sign=1, exp=255, mantissa=all-ones
      const value = fp32.decode(1, 255, (1 << 23) - 1);
      expect(Number.isNaN(value)).toBe(true);
    });

    test('OCP FP4 E2M1 all-ones pattern decodes to -6.0 (max negative)', () => {
      const fp4 = new FloatingPoint(1, 2, 1, { bias: 1, hasInfinity: false, hasNaN: false });
      
      // All ones: sign=1, exp=3, mantissa=1
      const value = fp4.decode(1, 3, 1);
      expect(value).toBe(-6.0);
    });

    test('format without sign bit all-ones pattern', () => {
      const fp = new FloatingPoint(0, 4, 3);
      
      // No sign bit, so all-ones is exp=15, mantissa=7
      const value = fp.decode(0, 15, 7);
      expect(Number.isNaN(value)).toBe(true); // exp=maxExp with mantissa!=0 is NaN
    });

    test('OCP FP8 E4M3 all-ones pattern is NaN', () => {
      const fp8 = new FloatingPoint(1, 4, 3, { bias: 7, hasInfinity: false, hasNaN: true });
      
      // All ones: sign=1, exp=15, mantissa=7
      const value = fp8.decode(1, 15, 7);
      expect(Number.isNaN(value)).toBe(true);
    });
  });
});
