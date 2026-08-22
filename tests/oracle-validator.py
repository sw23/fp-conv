#!/usr/bin/env python3
"""
IEEE 754 Oracle Validator
Uses Python's struct module (backed by actual hardware IEEE 754 implementation)
to generate known-correct test vectors for JavaScript floating-point library.
"""

import struct
import json
import math
import sys
from fractions import Fraction

def fp32_to_components(value):
    """Convert float to FP32 sign, exponent, mantissa using actual IEEE 754."""
    # Pack as IEEE 754 single precision
    packed = struct.pack('>f', value)
    bits = struct.unpack('>I', packed)[0]
    
    sign = (bits >> 31) & 0x1
    exponent = (bits >> 23) & 0xFF
    mantissa = bits & 0x7FFFFF
    
    # Classify the value
    is_zero = (exponent == 0 and mantissa == 0)
    is_subnormal = (exponent == 0 and mantissa != 0)
    is_normal = (exponent != 0 and exponent != 0xFF)
    is_infinite = (exponent == 0xFF and mantissa == 0)
    is_nan = (exponent == 0xFF and mantissa != 0)
    
    return {
        'sign': sign,
        'exponent': exponent,
        'mantissa': mantissa,
        'binary': format(bits, '032b'),
        'hex': f'0x{bits:08X}',
        'isZero': is_zero,
        'isSubnormal': is_subnormal,
        'isNormal': is_normal,
        'isInfinite': is_infinite,
        'isNaN': is_nan
    }

def fp32_from_components(sign, exponent, mantissa):
    """Convert FP32 components to float using actual IEEE 754."""
    bits = (sign << 31) | (exponent << 23) | mantissa
    packed = struct.pack('>I', bits)
    value = struct.unpack('>f', packed)[0]
    return value

def fp16_to_components(value):
    """Convert float to FP16 sign, exponent, mantissa."""
    # Python doesn't have native FP16 in struct, but we can convert via FP32
    # First clamp to FP16 range
    if math.isnan(value):
        return {'sign': 0, 'exponent': 31, 'mantissa': 1, 'isNaN': True, 
                'isZero': False, 'isSubnormal': False, 'isNormal': False, 'isInfinite': False}
    if math.isinf(value):
        sign = 1 if value < 0 else 0
        return {'sign': sign, 'exponent': 31, 'mantissa': 0, 'isInfinite': True,
                'isNaN': False, 'isZero': False, 'isSubnormal': False, 'isNormal': False}
    
    # Get FP32 representation first
    fp32 = fp32_to_components(value)
    
    # Convert to FP16 manually (this is the reference implementation)
    sign = fp32['sign']
    exp32 = fp32['exponent']
    mant32 = fp32['mantissa']
    
    # Adjust exponent bias (127 -> 15)
    if exp32 == 0 and mant32 == 0:  # Zero
        return {'sign': sign, 'exponent': 0, 'mantissa': 0, 'isZero': True,
                'isNaN': False, 'isSubnormal': False, 'isNormal': False, 'isInfinite': False}
    
    if exp32 == 0:  # FP32 subnormal
        # This will likely become zero in FP16
        return {'sign': sign, 'exponent': 0, 'mantissa': 0, 'isZero': True,
                'isNaN': False, 'isSubnormal': False, 'isNormal': False, 'isInfinite': False}
    
    # Normal number - adjust exponent
    exp_unbiased = exp32 - 127
    exp16 = exp_unbiased + 15
    
    if exp16 <= 0:  # Underflow to subnormal or zero
        # Shift mantissa right
        shift = 1 - exp16
        if shift >= 10:  # Underflow to zero
            return {'sign': sign, 'exponent': 0, 'mantissa': 0, 'isZero': True,
                    'isNaN': False, 'isSubnormal': False, 'isNormal': False, 'isInfinite': False}
        # Subnormal
        full_mantissa = (1 << 23) | mant32  # Add implicit 1
        mant16 = full_mantissa >> (23 - 10 + shift)
        return {'sign': sign, 'exponent': 0, 'mantissa': mant16 & 0x3FF, 'isSubnormal': True,
                'isNaN': False, 'isZero': False, 'isNormal': False, 'isInfinite': False}
    
    if exp16 >= 31:  # Overflow to infinity
        return {'sign': sign, 'exponent': 31, 'mantissa': 0, 'isInfinite': True,
                'isNaN': False, 'isZero': False, 'isSubnormal': False, 'isNormal': False}
    
    # Normal FP16 - truncate mantissa from 23 bits to 10 bits
    mant16 = mant32 >> 13  # Drop bottom 13 bits
    
    return {'sign': sign, 'exponent': exp16, 'mantissa': mant16 & 0x3FF, 'isNormal': True,
            'isNaN': False, 'isZero': False, 'isSubnormal': False, 'isInfinite': False}

# ---------------------------------------------------------------------------
# Exact decimal -> format rounding.
#
# The vectors above all travel through Python floats, which are IEEE doubles -
# exactly the same intermediate the JavaScript library used to use. That makes
# them blind to double rounding: a decimal sitting just off a *target format*
# midpoint collapses onto that midpoint as a double, after which ties-to-even
# picks the even neighbour rather than the side the decimal was really on.
#
# Everything below uses fractions.Fraction instead, so the decimal is never
# approximated and the target format is reached in a single rounding step. This
# reproduces (in stdlib Python) the results of David M. Gay's dtoa.c, which was
# used to find the original defect.
# ---------------------------------------------------------------------------

FLOAT_FORMATS = {
    'fp64':     {'exponent': 11, 'mantissa': 52, 'bias': 1023, 'has_inf': True,  'has_nan': True},
    'fp32':     {'exponent': 8,  'mantissa': 23, 'bias': 127,  'has_inf': True,  'has_nan': True},
    'fp16':     {'exponent': 5,  'mantissa': 10, 'bias': 15,   'has_inf': True,  'has_nan': True},
    'bf16':     {'exponent': 8,  'mantissa': 7,  'bias': 127,  'has_inf': True,  'has_nan': True},
    'tf32':     {'exponent': 8,  'mantissa': 10, 'bias': 127,  'has_inf': True,  'has_nan': True},
    'fp8_e5m2': {'exponent': 5,  'mantissa': 2,  'bias': 15,   'has_inf': True,  'has_nan': True},
    'fp8_e4m3': {'exponent': 4,  'mantissa': 3,  'bias': 7,    'has_inf': False, 'has_nan': True},
    'fp6_e3m2': {'exponent': 3,  'mantissa': 2,  'bias': 3,    'has_inf': False, 'has_nan': False},
    'fp6_e2m3': {'exponent': 2,  'mantissa': 3,  'bias': 1,    'has_inf': False, 'has_nan': False},
    'fp4_e2m1': {'exponent': 2,  'mantissa': 1,  'bias': 1,    'has_inf': False, 'has_nan': False},
}

INTEGER_FORMATS = {
    'int32':  {'bits': 32, 'signed': True},
    'int8':   {'bits': 8,  'signed': True},
    'uint8':  {'bits': 8,  'signed': False},
    'int4':   {'bits': 4,  'signed': True},
    'uint4':  {'bits': 4,  'signed': False},
}

ROUNDING_MODES = ['tiesToEven', 'tiesToAway', 'towardZero',
                  'towardPositive', 'towardNegative']

TWO = Fraction(2)


def max_exponent_field(spec):
    return (1 << spec['exponent']) - 1


def min_exponent(spec):
    """Unbiased exponent of the smallest normal."""
    return 1 - spec['bias']


def max_exponent(spec):
    """Unbiased exponent of the largest normal."""
    top = max_exponent_field(spec)
    if spec['has_inf']:
        top -= 1  # all-ones is reserved for infinity and NaN
    return top - spec['bias']


def max_mantissa_field(spec):
    full = (1 << spec['mantissa']) - 1
    if spec['has_inf']:
        return full
    if spec['has_nan']:
        return full - 1  # OCP E4M3 reserves all-ones for NaN
    return full


def max_normal_fields(spec):
    return (max_exponent(spec) + spec['bias'], max_mantissa_field(spec))


def fields_to_fraction(spec, exponent_field, mantissa_field):
    """Exact value of a (exponent, mantissa) field pair, as a Fraction."""
    scale = spec['mantissa']
    if exponent_field == 0:
        return Fraction(mantissa_field) * TWO ** (min_exponent(spec) - scale)
    significand = (1 << scale) | mantissa_field
    return Fraction(significand) * TWO ** (exponent_field - spec['bias'] - scale)


def round_fraction(value, sign, mode):
    """Round a non-negative Fraction to an int under the given mode.

    `sign` is 0 for positive and 1 for negative; the directed modes act on the
    magnitude, matching the library's roundMantissa().
    """
    quotient, remainder = divmod(value.numerator, value.denominator)
    if remainder == 0:
        return quotient

    twice = 2 * remainder
    denominator = value.denominator
    if mode == 'tiesToEven':
        if twice > denominator:
            return quotient + 1
        if twice < denominator:
            return quotient
        return quotient if quotient % 2 == 0 else quotient + 1
    if mode == 'tiesToAway':
        return quotient + 1 if twice >= denominator else quotient
    if mode == 'towardZero':
        return quotient
    if mode == 'towardPositive':
        return quotient if sign else quotient + 1
    if mode == 'towardNegative':
        return quotient + 1 if sign else quotient
    raise ValueError('unknown rounding mode: %s' % mode)


def finalize_fields(spec, sign, exponent_field, mantissa_field, mode):
    """Apply mantissa carry, overflow and OCP special-value rules."""
    if mantissa_field >= (1 << spec['mantissa']):
        mantissa_field = 0
        exponent_field += 1

    top = max_exponent_field(spec)
    if exponent_field > top or (exponent_field == top and spec['has_inf']):
        should_clamp = (mode == 'towardZero'
                        or (mode == 'towardNegative' and sign == 0)
                        or (mode == 'towardPositive' and sign == 1))
        if should_clamp or not spec['has_inf']:
            return max_normal_fields(spec)
        return (top, 0)  # infinity

    if (exponent_field == top and spec['has_nan'] and not spec['has_inf']
            and mantissa_field >= max_mantissa_field(spec)):
        return max_normal_fields(spec)

    return (exponent_field, mantissa_field)


def round_to_format(magnitude, sign, spec, mode):
    """Correctly round an exact positive Fraction to (exponent, mantissa)."""
    if magnitude == 0:
        return (0, 0)

    # Unique e with 2^e <= magnitude < 2^(e+1). The bit-length difference is
    # either e or e+1, so verify and correct.
    exponent = magnitude.numerator.bit_length() - magnitude.denominator.bit_length()
    if magnitude < TWO ** exponent:
        exponent -= 1

    if exponent + spec['bias'] > max_exponent_field(spec):
        return finalize_fields(spec, sign, max_exponent_field(spec) + 1, 0, mode)

    # Subnormals share the fixed exponent 2^(1-bias); normals use their binade.
    subnormal = exponent < min_exponent(spec)
    effective = min_exponent(spec) if subnormal else exponent
    scaled = magnitude * TWO ** (spec['mantissa'] - effective)
    significand = round_fraction(scaled, sign, mode)

    if subnormal:
        return finalize_fields(spec, sign, 0, significand, mode)
    return finalize_fields(spec, sign, exponent + spec['bias'],
                           significand - (1 << spec['mantissa']), mode)


def decimal_to_fraction(text):
    """Exact (sign, magnitude) of a plain decimal literal."""
    body = text.strip()
    sign = 1 if body.startswith('-') else 0
    body = body.lstrip('+-')

    if 'e' in body or 'E' in body:
        mantissa_text, _, exponent_text = body.replace('E', 'e').partition('e')
        exponent = int(exponent_text)
    else:
        mantissa_text, exponent = body, 0

    int_part, _, frac_part = mantissa_text.partition('.')
    digits = int((int_part + frac_part) or '0')
    return sign, Fraction(digits) * Fraction(10) ** (exponent - len(frac_part))


def scaled_int_to_decimal(numerator, places):
    """Exact decimal string for numerator / 10**places (numerator > 0).

    Emitted in exponent form: the deep subnormals of the wide-exponent formats
    would otherwise need hundreds of leading zeros.
    """
    digits = str(numerator)
    return '0.%se%d' % (digits, len(digits) - places)


def dyadic_to_scaled_int(value):
    """Express a positive dyadic Fraction as (numerator, places) = n / 10**places."""
    places = value.denominator.bit_length() - 1
    assert value.denominator == 1 << places, 'value must be dyadic'
    return value.numerator * 5 ** places, places


# A decimal this far past the exact midpoint is still well inside the gap
# between the midpoint and its neighbouring double, so it collapses onto the
# midpoint when parsed as a double - which is exactly the trap being tested.
MIDPOINT_PADDING = 21


def midpoint_probe_strings(midpoint):
    """Decimal strings immediately below and above an exact dyadic midpoint."""
    numerator, places = dyadic_to_scaled_int(midpoint)
    shifted = numerator * 10 ** MIDPOINT_PADDING
    padded_places = places + MIDPOINT_PADDING
    return (scaled_int_to_decimal(shifted - 1, padded_places),
            scaled_int_to_decimal(shifted + 1, padded_places))


def sample_field_pairs(spec):
    """A deterministic spread of (exponent, mantissa) field pairs per format."""
    mantissa_span = 1 << spec['mantissa']
    top_exponent = max_exponent(spec) + spec['bias']

    mantissas = sorted({0, mantissa_span // 2, mantissa_span - 1})
    exponents = sorted({0, 1, top_exponent // 2, top_exponent})

    pairs = []
    for exponent_field in exponents:
        if not 0 <= exponent_field <= top_exponent:
            continue
        for mantissa_field in mantissas:
            if mantissa_field > mantissa_span - 1:
                continue
            if exponent_field == 0 and mantissa_field == 0:
                continue  # zero has no lower neighbour to straddle
            pairs.append((exponent_field, mantissa_field))
    return pairs


def generate_midpoint_vectors():
    """Decimals straddling a format midpoint, where double rounding shows up."""
    vectors = []
    for name in sorted(FLOAT_FORMATS):
        spec = FLOAT_FORMATS[name]
        ceiling = fields_to_fraction(spec, *max_normal_fields(spec))
        seen = set()

        for exponent_field, mantissa_field in sample_field_pairs(spec):
            lower = fields_to_fraction(spec, exponent_field, mantissa_field)
            if lower >= ceiling:
                continue
            # The next representable value up, found by incrementing the fields.
            if mantissa_field == (1 << spec['mantissa']) - 1:
                upper = fields_to_fraction(spec, exponent_field + 1, 0)
            else:
                upper = fields_to_fraction(spec, exponent_field, mantissa_field + 1)
            if upper > ceiling:
                continue

            midpoint = (lower + upper) / 2
            for text in midpoint_probe_strings(midpoint):
                if text in seen:
                    continue
                seen.add(text)
                sign, magnitude = decimal_to_fraction(text)
                exponent, mantissa = round_to_format(magnitude, sign, spec, 'tiesToEven')
                vectors.append({
                    'format': name,
                    'input': text,
                    'expected': {'sign': 0, 'exponent': exponent, 'mantissa': mantissa},
                })
    return vectors


# Decimal strings worth pinning across every format and rounding mode. The
# 17-digit entries are the shortest inputs that reach the double-rounding hole.
STRING_ENCODE_INPUTS = [
    '0', '-0', '1', '-1', '0.5', '2.5', '-2.5', '0.1', '-0.1', '0.3',
    '3.14159265358979323846264338327950288',
    '2.718281828459045235360287471352662497757247093699959574966',
    '1e-3', '123.456', '65504', '65505', '448', '449', '6', '7',
    '0.74999999999999999', '-0.74999999999999999',
    '0.18749999999999999', '0.0029296874999999999',
    '0.000022888183593749999', '0.00000008940696716308593749',
    '9007199254740993', '8.3e26', '6.3876e-16',
    '2.2250738585072011e-308', '2.2250738585072012e-308',
    '4.9e-324', '1.7976931348623157e308', '1e-400', '1e400',
    '1234567890123456789012345678901234567890e-40',
]


# Formats that get the full rounding-mode cross product. The rest are pinned
# under the default mode only - one wide format, one narrow IEEE format, one OCP
# format with NaN but no infinity, and the smallest format of all.
MODE_SWEEP_FORMATS = ['fp64', 'fp16', 'fp8_e4m3', 'fp4_e2m1']

# Inputs where the rounding mode can actually change the answer: inexact
# decimals, exact ties, and the overflow boundary (where the directed modes must
# saturate to max normal rather than reach infinity).
MODE_SWEEP_INPUTS = [
    '0', '-0', '1', '-1', '0.5', '2.5', '-2.5', '0.1', '-0.1', '0.3',
    '1e-3', '123.456', '65504', '65505', '448', '449', '6', '7',
    '0.74999999999999999', '-0.74999999999999999',
    '9007199254740993', '1e400', '1e-400',
]


def generate_string_encode_vectors():
    """Every input above, encoded into every format.

    All formats are covered under the default mode; MODE_SWEEP_FORMATS also get
    every rounding mode over MODE_SWEEP_INPUTS, which is where the directed
    modes are pinned.
    """
    vectors = []
    for name in sorted(FLOAT_FORMATS):
        spec = FLOAT_FORMATS[name]
        cases = [(text, 'tiesToEven') for text in STRING_ENCODE_INPUTS]
        if name in MODE_SWEEP_FORMATS:
            cases += [(text, mode) for text in MODE_SWEEP_INPUTS
                      for mode in ROUNDING_MODES if mode != 'tiesToEven']

        for text, mode in cases:
            sign, magnitude = decimal_to_fraction(text)
            exponent, mantissa = round_to_format(magnitude, sign, spec, mode)
            vectors.append({
                'format': name,
                'input': text,
                'roundingMode': mode,
                'expected': {'sign': sign, 'exponent': exponent, 'mantissa': mantissa},
            })
    return vectors


def generate_integer_string_vectors():
    """Integer formats rounded straight from the decimal string, with saturation."""
    inputs = [
        '0', '1', '-1', '2.5', '-2.5', '0.5', '-0.5',
        '2.5000000000000001', '-2.5000000000000001',
        '1.9999999999999999', '1.0000000000000001',
        '127.5', '255.5', '-128.5', '1e99', '-1e99', '7.5', '-7.5',
    ]
    vectors = []
    for name in sorted(INTEGER_FORMATS):
        spec = INTEGER_FORMATS[name]
        if spec['signed']:
            low = -(1 << (spec['bits'] - 1))
            high = (1 << (spec['bits'] - 1)) - 1
        else:
            low, high = 0, (1 << spec['bits']) - 1

        for text in inputs:
            sign, magnitude = decimal_to_fraction(text)
            for mode in ROUNDING_MODES:
                value = round_fraction(magnitude, sign, mode)
                if sign:
                    value = -value
                value = max(low, min(high, value))
                vectors.append({
                    'format': name,
                    'input': text,
                    'roundingMode': mode,
                    'expected': value,
                })
    return vectors


def generate_test_vectors():
    """Generate comprehensive test vectors."""
    vectors = {
        'fp32_encode': [],
        'fp32_decode': [],
        'fp16_encode': [],
        'conversions': []
    }

    # FP32 Encode Test Vectors
    test_values = [
        0.0, -0.0, 1.0, -1.0, 2.0, 0.5, 0.25, -0.5,
        float('inf'), float('-inf'), float('nan'),
        # Powers of 2
        2**10, 2**-10, 2**20, 2**-20,
        # Smallest normal
        2**-126,
        # Largest normal (approximately)
        3.4028234663852886e+38,
        # Smallest subnormal
        2**-149,
        # Some subnormals
        2**-140, 2**-145,
        # Common values
        3.14159265359, 2.71828182846,
        # Boundary cases
        100.0, 1000.0, 0.1, 0.01
    ]
    
    for val in test_values:
        components = fp32_to_components(val)
        # Convert special values to strings for JSON compatibility
        if math.isnan(val):
            input_str = 'NaN'
        elif math.isinf(val):
            input_str = 'Infinity' if val > 0 else '-Infinity'
        else:
            input_str = val
        
        vectors['fp32_encode'].append({
            'input': input_str,
            'expected': components
        })
    
    # FP32 Decode Test Vectors
    decode_cases = [
        # (sign, exponent, mantissa, description)
        (0, 0, 0, 'positive zero'),
        (1, 0, 0, 'negative zero'),
        (0, 127, 0, '1.0'),
        (1, 127, 0, '-1.0'),
        (0, 128, 0, '2.0'),
        (0, 126, 0, '0.5'),
        (0, 255, 0, 'positive infinity'),
        (1, 255, 0, 'negative infinity'),
        (0, 255, 1, 'NaN'),
        (0, 1, 0, 'smallest normal'),
        (0, 0, 1, 'smallest subnormal'),
        (0, 254, 0x7FFFFF, 'largest normal'),
        (0, 0, 0x7FFFFF, 'largest subnormal'),
        # 1.5 = 1.1b × 2^0 = sign:0 exp:127 mantissa:0x400000
        (0, 127, 0x400000, '1.5'),
        # 3.14159... ≈ 0x40490FDB
        (0, 128, 0x490FDB, 'pi'),
    ]
    
    for sign, exp, mant, desc in decode_cases:
        value = fp32_from_components(sign, exp, mant)
        vectors['fp32_decode'].append({
            'sign': sign,
            'exponent': exp,
            'mantissa': mant,
            'expected': value if math.isfinite(value) else (
                'Infinity' if value > 0 else '-Infinity' if value < 0 else 'NaN'
            ),
            'description': desc
        })
    
    # FP16 specific vectors
    fp16_values = [
        0.0, 1.0, -1.0, 2.0, 0.5,
        # FP16 max ≈ 65504
        65504.0,
        # Values that overflow FP16
        100000.0,
        # Values that become subnormal in FP16
        2**-20, 2**-16,
    ]
    
    for val in fp16_values:
        components = fp16_to_components(val)
        # Convert special values to strings for JSON compatibility
        if math.isnan(val):
            input_str = 'NaN'
        elif math.isinf(val):
            input_str = 'Infinity' if val > 0 else '-Infinity'
        else:
            input_str = val
            
        vectors['fp16_encode'].append({
            'input': input_str,
            'expected': components
        })

    # Exact decimal-string vectors (Fraction-based, no float detour).
    vectors['string_encode'] = generate_string_encode_vectors()
    vectors['midpoint_straddle'] = generate_midpoint_vectors()
    vectors['integer_string_encode'] = generate_integer_string_vectors()

    return vectors

def main():
    vectors = generate_test_vectors()
    print(json.dumps(vectors, indent=2))

if __name__ == '__main__':
    main()
