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
});
