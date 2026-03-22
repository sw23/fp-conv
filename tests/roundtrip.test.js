// Import the FloatingPoint class from the pure math module
const { FloatingPoint } = require('../lib/floating-point.js');

describe('FloatingPoint Round-trip encode/decode', () => {
  const formats = {
    fp32: new FloatingPoint(1, 8, 23),
    fp16: new FloatingPoint(1, 5, 10),
    bf16: new FloatingPoint(1, 8, 7),
    fp8_e4m3: new FloatingPoint(1, 4, 3),
    fp8_e5m2: new FloatingPoint(1, 5, 2),
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
});
