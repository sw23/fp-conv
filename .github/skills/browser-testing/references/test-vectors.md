# Test Vectors

Known-good values for browser validation. Sourced from `tests/oracle-vectors.json` and `tests/conversions.test.js`.

## FP32 Encode Vectors

Enter these decimal values with **FP32** input format and verify the displayed components.

| Decimal | Sign | Exp (biased) | Mantissa | Hex | Type |
|---------|------|-------------|----------|-----|------|
| 0 | 0 | 0 | 0 | `0x00000000` | Zero |
| 1 | 0 | 127 | 0 | `0x3F800000` | Normal |
| -1 | 1 | 127 | 0 | `0xBF800000` | Normal |
| 0.5 | 0 | 126 | 0 | `0x3F000000` | Normal |
| 2 | 0 | 128 | 0 | `0x40000000` | Normal |
| 3.14159265359 | 0 | 128 | 4788187 | `0x40490FDB` | Normal |
| -3.14159265359 | 1 | 128 | 4788187 | `0xC0490FDB` | Normal |
| 100 | 0 | 133 | 4718592 | `0x42C80000` | Normal |
| 0.1 | 0 | 123 | 5033165 | `0x3DCCCCCD` | Normal |
| 3.4028234663852886e+38 | 0 | 254 | 8388607 | `0x7F7FFFFF` | Normal (max) |
| 1.1754943508222875e-38 | 0 | 1 | 0 | `0x00800000` | Normal (min) |
| 1.401298464324817e-45 | 0 | 0 | 1 | `0x00000001` | Subnormal (min) |
| Infinity | 0 | 255 | 0 | `0x7F800000` | Infinity |
| -Infinity | 1 | 255 | 0 | `0xFF800000` | Infinity |
| NaN | 0 | 255 | 4194304 | `0x7FC00000` | NaN |

## FP16 Encode Vectors

Enter these decimal values with **FP16** input format.

| Decimal | Sign | Exp (biased) | Mantissa | Hex | Type |
|---------|------|-------------|----------|-----|------|
| 0 | 0 | 0 | 0 | `0x0000` | Zero |
| 1 | 0 | 15 | 0 | `0x3C00` | Normal |
| -1 | 1 | 15 | 0 | `0xBC00` | Normal |
| 2 | 0 | 16 | 0 | `0x4000` | Normal |
| 0.5 | 0 | 14 | 0 | `0x3800` | Normal |
| 65504 | 0 | 30 | 1023 | `0x7BFF` | Normal (max) |
| 6.103515625e-05 | 0 | 1 | 0 | `0x0400` | Normal (min) |
| 5.960464477539063e-08 | 0 | 0 | 1 | `0x0001` | Subnormal (min) |
| 9.5367431640625e-07 | 0 | 0 | 16 | `0x0010` | Subnormal |

## Format Conversion Vectors

Use these to validate converting between formats. Set the input format, enter the value, set the output format, then verify the output.

### FP32 → FP16 (downconversion with precision loss)

| Input Value | Input Hex (FP32) | Expected Output Value | Output Hex (FP16) | Notes |
|-------------|------------------|-----------------------|-------------------|-------|
| 1.5 | `0x3FC00000` | 1.5 | `0x3E00` | Exact (representable in both) |
| 3.14159265359 | `0x40490FDB` | ~3.140625 | `0x4248` | Precision loss (mantissa truncated) |
| 100000 | `0x47C35000` | Infinity | `0x7C00` | Overflow to infinity |
| -100000 | `0xC7C35000` | -Infinity | `0xFC00` | Negative overflow preserves sign |

### FP32 → BF16

| Input Value | Expected Output Value | Notes |
|-------------|----------------------|-------|
| 1.234567 | ~1.234375 | Exponent preserved, mantissa truncated |

### FP16 → FP32 (upconversion, exact)

| Input Value | Notes |
|-------------|-------|
| 3.14 | Exact upconversion, no precision loss |

### Normal → Subnormal Transitions

| Conversion | Input Value | Expected Behavior |
|------------|-------------|-------------------|
| FP32 → FP16 | 2^-20 (~9.5e-7) | Normal in FP32, subnormal in FP16 |
| FP16 → FP8 E4M3 | 2^-8 (0.00390625) | Normal in FP16, subnormal in FP8 |

### Underflow to Zero

| Conversion | Input Value | Expected Output |
|------------|-------------|-----------------|
| FP32 → FP16 | 2^-145 | 0 (underflows to zero) |
| FP16 → FP8 E4M3 | 2^-23 | 0 (underflows to zero) |

## Special Value Vectors

Test these across multiple format pairs.

### Infinity Preservation

| Input Format | Output Format | Input | Expected Output |
|-------------|---------------|-------|-----------------|
| FP32 | FP16 | +Infinity | +Infinity |
| FP32 | FP16 | -Infinity | -Infinity |
| FP16 | FP32 | +Infinity | +Infinity |
| FP32 | BF16 | +Infinity | +Infinity |
| FP32 | FP8 E4M3 | +Infinity | 448 (saturates to max normal, `hasInfinity=false`) |
| FP32 | FP8 E4M3 | -Infinity | -448 (saturates to negative max normal) |

### NaN Preservation

| Input Format | Output Format | Input | Expected Output |
|-------------|---------------|-------|-----------------|
| FP32 | FP16 | NaN | NaN |
| FP16 | FP32 | NaN | NaN |
| FP32 | BF16 | NaN | NaN |

### Negative Zero

| Input Format | Output Format | Input | Expected Output |
|-------------|---------------|-------|-----------------|
| FP32 | FP16 | -0 | -0 |
| FP16 | FP32 | -0 | -0 |

## Value Preset Expected Results

Click value presets with FP32 input format and verify:

| Preset Button | Expected Decimal | Expected Hex | Type |
|---------------|-----------------|--------------|------|
| 0 | 0 | `0x00000000` | Zero |
| 1 | 1 | `0x3F800000` | Normal |
| Max Norm | 3.4028234663852886e+38 | `0x7F7FFFFF` | Normal |
| Min Norm | 1.1754943508222875e-38 | `0x00800000` | Normal |
| Max Sub | 1.1754942106924411e-38 | `0x007FFFFF` | Subnormal |
| Min Sub | 1.401298464324817e-45 | `0x00000001` | Subnormal |
| +Inf | Infinity | `0x7F800000` | Infinity |
| -Inf | -Infinity | `0xFF800000` | Infinity |
| NaN | NaN | `0x7F800001` | NaN (smallest signaling NaN) |
| 1s | NaN | `0xFFFFFFFF` | NaN (all bits set) |

## Format Total Bits

Verify these after clicking each format preset:

| Format | Total Bits | Sign | Exponent | Mantissa |
|--------|-----------|------|----------|----------|
| FP64 | 64 | 1 | 11 | 52 |
| FP32 | 32 | 1 | 8 | 23 |
| FP16 | 16 | 1 | 5 | 10 |
| BF16 | 16 | 1 | 8 | 7 |
| TF32 | 19 | 1 | 8 | 10 |
| FP8 E5M2 | 8 | 1 | 5 | 2 |
| FP8 E4M3 | 8 | 1 | 4 | 3 |
| FP6 E3M2 | 6 | 1 | 3 | 2 |
| FP6 E2M3 | 6 | 1 | 2 | 3 |
| FP4 E2M1 | 4 | 1 | 2 | 1 |
| INT32 | 32 | - | - | - |
| UINT32 | 32 | - | - | - |
| INT16 | 16 | - | - | - |
| UINT16 | 16 | - | - | - |
| INT8 | 8 | - | - | - |
| UINT8 | 8 | - | - | - |
| INT4 | 4 | - | - | - |
| UINT4 | 4 | - | - | - |

## Round-Trip Vectors

These conversions should be lossless when round-tripped:

| Path | Value | Expected |
|------|-------|----------|
| FP16 → FP32 → FP16 | 1.5 | Identical (lossless) |
| FP16 → FP32 → FP16 | 3.140625 | Identical (lossless) |
| BF16 → FP32 → BF16 | 1.0 | Identical (lossless) |

## Rounding Mode Vectors

Test with a value where rounding matters. Use FP32 input → FP16 output.

The value **1.0004882812500** (FP32 hex `0x3F801000`, = 1 + 2^-11) is exactly halfway between two FP16 representable values: 1.0 (mantissa=0) and 1.0009765625 (mantissa=1).

| Rounding Mode | Expected FP16 Output |
|---------------|---------------------|
| tiesToEven | 1.0 (rounds to even mantissa=0) |
| tiesToAway | 1.0009765625 (rounds away from zero) |
| towardZero | 1.0 (truncates toward zero) |
| towardPositive | 1.0009765625 (rounds toward +infinity) |
| towardNegative | 1.0 (rounds toward -infinity) |

**Note**: 1.0009765625 is exactly representable in FP16, so it does NOT trigger rounding differences. Use 1.0004882812500 instead.
