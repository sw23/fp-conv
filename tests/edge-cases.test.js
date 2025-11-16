// Import the FloatingPoint class from the pure math module
const { FloatingPoint, FORMATS } = require('../lib/floating-point.js');

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
});
