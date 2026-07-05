// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

// Import the FloatingPoint class from the pure math module
const { FloatingPoint } = require('../lib/floating-point.js');

describe('FloatingPoint Round-trip encode/decode', () => {
  const formats = {
    fp32: new FloatingPoint(1, 8, 23),
    fp16: new FloatingPoint(1, 5, 10),
    bf16: new FloatingPoint(1, 8, 7),
    fp8_e4m3: new FloatingPoint(1, 4, 3, { bias: 7, hasInfinity: false, hasNaN: true }),
    fp8_e5m2: new FloatingPoint(1, 5, 2, { bias: 15, hasInfinity: true, hasNaN: true }),
  };

  test('preserves exact values through round-trip (FP32)', () => {
    const testValues = [0, 1, -1, 2, 0.5, 0.25, -3.5, 100, -200, 1e10, 1e-10];
    
    testValues.forEach(value => {
      const encoded = formats.fp32.encode(value);
      const decoded = formats.fp32.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBeCloseTo(value, 10);
    });
  });

  test('preserves special values through round-trip (FP32)', () => {
    const testValues = [0, -0, Infinity, -Infinity, NaN];
    
    testValues.forEach(value => {
      const encoded = formats.fp32.encode(value);
      const decoded = formats.fp32.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      
      if (isNaN(value)) {
        expect(isNaN(decoded)).toBe(true);
      } else if (Object.is(value, -0)) {
        expect(Object.is(decoded, -0)).toBe(true);
      } else {
        expect(decoded).toBe(value);
      }
    });
  });

  test('preserves exact powers of two across formats', () => {
    const powersOfTwo = [1, 2, 4, 8, 0.5, 0.25, 0.125];

    for (const [_name, format] of Object.entries(formats)) {
      powersOfTwo.forEach(value => {
        const encoded = format.encode(value);
        const decoded = format.decode(encoded.sign, encoded.exponent, encoded.mantissa);
        // Powers of two are exactly representable within the format's range
        if (decoded !== Infinity && decoded !== -Infinity) {
          expect(decoded).toBe(value);
        }
      });
    }
  });

  test('round-trip preserves sign for FP16 and BF16', () => {
    const values = [1.5, -1.5, 0.75, -0.75];

    for (const format of [formats.fp16, formats.bf16]) {
      values.forEach(value => {
        const encoded = format.encode(value);
        const decoded = format.decode(encoded.sign, encoded.exponent, encoded.mantissa);
        expect(Math.sign(decoded)).toBe(Math.sign(value));
      });
    }
  });

  test('encode→decode is idempotent (re-encoding decoded value gives same bits)', () => {
    const testValues = [3.14, -2.718, 42, 0.1, 1e5];

    for (const [_name, format] of Object.entries(formats)) {
      testValues.forEach(value => {
        const encoded1 = format.encode(value);
        const decoded = format.decode(encoded1.sign, encoded1.exponent, encoded1.mantissa);
        const encoded2 = format.encode(decoded);
        expect(encoded2.sign).toBe(encoded1.sign);
        expect(encoded2.exponent).toBe(encoded1.exponent);
        expect(encoded2.mantissa).toBe(encoded1.mantissa);
      });
    }
  });

  test('subnormal round-trip (FP16)', () => {
    // Smallest FP16 subnormal: 2^-24
    const minSubnormal = Math.pow(2, -24);
    const encoded = formats.fp16.encode(minSubnormal);
    const decoded = formats.fp16.decode(encoded.sign, encoded.exponent, encoded.mantissa);
    expect(decoded).toBe(minSubnormal);
    expect(encoded.exponent).toBe(0);
    expect(encoded.mantissa).toBe(1);
  });

  test('special values round-trip for all formats', () => {
    for (const [_name, format] of Object.entries(formats)) {
      // Zero
      const zeroEnc = format.encode(0);
      expect(format.decode(zeroEnc.sign, zeroEnc.exponent, zeroEnc.mantissa)).toBe(0);

      // NaN
      const nanEnc = format.encode(NaN);
      expect(isNaN(format.decode(nanEnc.sign, nanEnc.exponent, nanEnc.mantissa))).toBe(true);
    }
  });

  describe('Cross-format round-trip conversions', () => {
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
});
