// Import the FloatingPoint class from the pure math module
const { FloatingPoint } = require('../lib/floating-point.js');

describe('FloatingPoint Edge Cases and Boundary Conditions', () => {
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

  test('mantissa overflow causes exponent increment and overflow to infinity', () => {
    // Overflowing mantissa pushes exponent into special range when infinity exists
    const fp = new FloatingPoint(1, 3, 2, { hasInfinity: true, hasNaN: true, bias: 3 });
    const result = fp.encode(15);
    expect(result.isInfinite).toBe(true);
    expect(result.exponent).toBe(7);
    expect(result.mantissa).toBe(0);
  });

  test('mantissa overflow causes exponent increment but saturates when no infinity', () => {
    // Same overflow path but with saturation because infinity is disabled
    const fp = new FloatingPoint(1, 3, 2, { hasInfinity: false, hasNaN: false, bias: 3 });
    const result = fp.encode(100);
    expect(result.isInfinite).toBe(false);
    expect(result.isNormal).toBe(true);
    expect(result.exponent).toBe(7); // maxExponent
    expect(result.mantissa).toBe(3); // all bits set
  });

  test('handles rounding that causes mantissa overflow leading to infinity via exponent overflow', () => {
    // Rounding bump forces mantissa overflow which then trips infinity
    const fp = new FloatingPoint(1, 2, 1, { hasInfinity: true, hasNaN: true, bias: 1 });
    const result = fp.encode(7.5);
    expect(result.isInfinite).toBe(true);
  });

  test('handles rounding that causes mantissa overflow and exponent overflow without infinity', () => {
    // Rounding overflow with no infinity saturates at max normal value
    const fp = new FloatingPoint(1, 4, 3, { hasInfinity: false, hasNaN: false, bias: 7 });
    const result = fp.encode(500);
    expect(result.isInfinite).toBe(false);
    expect(result.isNormal).toBe(true);
    expect(result.exponent).toBe(15); // maxExponent
    expect(result.mantissa).toBe(7); // all mantissa bits set
  });

  test('fixed-point encodes negative value (sign=1 path)', () => {
    const fp = new FloatingPoint(1, 0, 8);
    const encoded = fp.encode(-0.5);
    expect(encoded.sign).toBe(1);
    expect(encoded.mantissa).toBe(128); // 0.5 * 2^8
    expect(encoded.isNormal).toBe(false);
  });

  test('fixed-point decodes negative value (sign=1 path)', () => {
    const fp = new FloatingPoint(1, 0, 8);
    const decoded = fp.decode(1, 0, 128);
    expect(decoded).toBeCloseTo(-0.5, 3);
  });

  test('fixed-point round-trip with negative values', () => {
    const fp = new FloatingPoint(1, 0, 8);
    const testValues = [-0.25, -0.5, -0.75, -0.125];
    testValues.forEach(value => {
      const encoded = fp.encode(value);
      const decoded = fp.decode(encoded.sign, encoded.exponent, encoded.mantissa);
      expect(decoded).toBeCloseTo(value, 3);
    });
  });

  test('getMaxNormal for format with hasNaN=true and hasInfinity=false', () => {
    // OCP-style: only all-ones mantissa at maxExponent is NaN.
    // Max normal = (maxExp, maxMantissa - 1) = (15, 6) = 448.
    const fp = new FloatingPoint(1, 4, 3, { hasInfinity: false, hasNaN: true, bias: 7 });
    const maxNormal = fp.getMaxNormal();
    expect(maxNormal.exponent).toBe(15); // maxExponent
    expect(maxNormal.mantissa).toBe(6); // maxMantissa - 1
    expect(maxNormal.isNormal).toBe(true);

    const negMax = fp.getMaxNormal(true);
    expect(negMax.sign).toBe(1);
    expect(negMax.exponent).toBe(15);
    expect(negMax.mantissa).toBe(6);
  });

  test('getMaxNormal for format without infinity and without NaN', () => {
    const fp = new FloatingPoint(1, 3, 2, { hasInfinity: false, hasNaN: false, bias: 3 });
    const maxNormal = fp.getMaxNormal();
    // No special values: maxExponent is usable, full mantissa
    expect(maxNormal.exponent).toBe(7);
    expect(maxNormal.mantissa).toBe(3);
  });

  test('decode normal number with 0 mantissa bits', () => {
    // Format: sign=0, exp=8, mant=0 (like FP8_E8M0)
    const fp = new FloatingPoint(0, 8, 0);
    // Normal: mantissaValue = 1.0 (since mantissaBits is 0)
    const decoded = fp.decode(0, 130, 0); // 1.0 * 2^(130-127) = 8.0
    expect(decoded).toBe(8.0);
  });

  test('decode subnormal with 0 mantissa bits returns 0', () => {
    const fp = new FloatingPoint(0, 8, 0);
    // Subnormal with mantissaBits=0: mantissaValue = 0
    const decoded = fp.decode(0, 0, 0);
    expect(decoded).toBe(0);
  });

  test('decode at maxExponent without hasInfinity and without hasNaN falls through to normal', () => {
    const fp = new FloatingPoint(1, 3, 2, { hasInfinity: false, hasNaN: false, bias: 3 });
    // maxExponent=7, mantissa=3 — should decode as normal number, not special
    const decoded = fp.decode(0, 7, 3);
    expect(decoded).toBe((1 + 3/4) * Math.pow(2, 7 - 3)); // 1.75 * 16 = 28
    expect(decoded).toBe(28);
  });

  test('encode value into format where NaN block triggers (biasedExp=maxExp, hasNaN, !hasInf, mant>0)', () => {
    // A format where encoding a value just below the threshold could land
    // at maxExponent with non-zero mantissa, which would be NaN.
    // The encode path should clamp to getMaxNormal instead.
    const fp = new FloatingPoint(1, 4, 3, { hasInfinity: false, hasNaN: true, bias: 7 });
    // Max normal for this format is (15, 0) = 1.0 * 2^(15-7) = 256
    const maxNormalVal = fp.decode(0, 15, 0);
    expect(maxNormalVal).toBe(256);

    // Encode a value that would naturally land at maxExponent with non-zero mantissa
    // This tests the "NaN at maxExponent" clamping path
    const encoded = fp.encode(240); // Close to 256, mantissa would be non-zero
    expect(encoded.isNaN).toBe(false);
    expect(encoded.isNormal).toBe(true);
  });

  test('Integer constructor uses default signed=true when not provided', () => {
    const { Integer } = require('../lib/floating-point.js');
    const int = new Integer(8);
    expect(int.signed).toBe(true);
    expect(int.minValue).toBe(-128);
    expect(int.maxValue).toBe(127);
  });

  test('getZero called without argument uses default negative=false', () => {
    const fp = new FloatingPoint(1, 8, 23);
    const zero = fp.getZero();
    expect(zero.sign).toBe(0);
    expect(zero.isZero).toBe(true);
  });

  test('getMaxNormal called without argument uses default negative=false', () => {
    const fp = new FloatingPoint(1, 8, 23);
    const maxNormal = fp.getMaxNormal();
    expect(maxNormal.sign).toBe(0);
    expect(maxNormal.isNormal).toBe(true);
  });

  test('getMaxNormal on format with 0 mantissa bits', () => {
    const fp = new FloatingPoint(0, 8, 0);
    const maxNormal = fp.getMaxNormal();
    // mantissaBits=0, hasInfinity=true → exp = maxExponent - 1
    expect(maxNormal.exponent).toBe(254);
    expect(maxNormal.mantissa).toBe(0);
    expect(maxNormal.isNormal).toBe(true);
  });

  test('fixed-point format with 0 mantissa bits encode returns mantissa=0', () => {
    // exponentBits=0, mantissaBits=0: a degenerate 1-bit format (sign only)
    const fp = new FloatingPoint(1, 0, 0);
    const encoded = fp.encode(0.5);
    expect(encoded.mantissa).toBe(0);
    expect(encoded.exponent).toBe(0);
  });

  test('fixed-point format with 0 mantissa bits decode returns 0', () => {
    const fp = new FloatingPoint(1, 0, 0);
    const decoded = fp.decode(0, 0, 0);
    expect(decoded).toBe(0);

    // With sign=1, should return -0
    const decodedNeg = fp.decode(1, 0, 0);
    expect(Object.is(decodedNeg, -0)).toBe(true);
  });

  test('format with 0 mantissa bits handles subnormal decode (mantissaValue=0)', () => {
    // A format with 0 mantissa bits: subnormals still have mantissa=0
    const fp = new FloatingPoint(1, 4, 0);
    // exponent=0, mantissa=0 → zero
    const decoded = fp.decode(0, 0, 0);
    expect(decoded).toBe(0);
  });

  test('decode negative zero with exponent=0 and mantissa=0', () => {
    const fp = new FloatingPoint(1, 8, 23);
    // sign=1, exponent=0, mantissa=0 → -0
    const decoded = fp.decode(1, 0, 0);
    expect(Object.is(decoded, -0)).toBe(true);
  });

  test('decode subnormal with mantissaBits=0 and non-zero mantissa returns 0', () => {
    // FP with 0 mantissa bits: subnormal mantissaValue branch → 0
    const fp = new FloatingPoint(0, 4, 0);
    // Artificially pass mantissa=1 to exercise the mantissaBits=0 subnormal branch
    // mantissaValue = mantissaBits > 0 ? m/2^mBits : 0 → 0, so value = 0 * 2^(1-bias) = 0
    const decoded = fp.decode(0, 0, 1);
    expect(decoded).toBe(0);
  });
});
