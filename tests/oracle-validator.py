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
    'e8m0':     {'exponent': 8,  'mantissa': 0,  'bias': 127,  'has_inf': False, 'has_nan': True, 'has_subnormals': False, 'unsigned': True},
}

INTEGER_FORMATS = {
    'int32':  {'bits': 32, 'signed': True},
    'int8':   {'bits': 8,  'signed': True},
    'uint8':  {'bits': 8,  'signed': False},
    'int4':   {'bits': 4,  'signed': True},
    'uint4':  {'bits': 4,  'signed': False},
    'mxint8': {'bits': 8,  'signed': True, 'fraction_bits': 6, 'symmetric': True},
}

ROUNDING_MODES = ['tiesToEven', 'tiesToAway', 'towardZero',
                  'towardPositive', 'towardNegative']

OVERFLOW_MODES = ['saturate', 'overflow']

TWO = Fraction(2)


def has_subnormals(spec):
    return spec.get('has_subnormals', True)


def max_exponent_field(spec):
    return (1 << spec['exponent']) - 1


def mantissa_span(spec):
    return 1 << spec['mantissa']


def full_mantissa_field(spec):
    return mantissa_span(spec) - 1


def min_exponent(spec):
    """Unbiased exponent of the smallest normal.

    A format with no subnormals uses exponent field 0 as an ordinary normal
    binade rather than reserving it, so its smallest normal is one binade lower.
    """
    return (1 if has_subnormals(spec) else 0) - spec['bias']


def max_normal_fields(spec):
    """(exponent, mantissa) fields of the largest finite magnitude."""
    top = max_exponent_field(spec)
    full = full_mantissa_field(spec)
    if spec['has_inf']:
        return (top - 1, full)  # all-ones exponent is Infinity and NaN
    if spec['has_nan']:
        if spec['mantissa'] > 0:
            return (top, full - 1)  # OCP E4M3: all-ones mantissa is NaN
        # No mantissa field to step back through: NaN claims the whole slot.
        return (top - 1, full)
    return (top, full)


def max_exponent(spec):
    """Unbiased exponent of the largest normal."""
    return max_normal_fields(spec)[0] - spec['bias']


def has_nan_encoding(spec):
    """True when the format actually has a bit pattern to spare for NaN."""
    return spec['has_nan'] and (spec['mantissa'] > 0 or not spec['has_inf'])


def nan_fields(spec):
    top = max_exponent_field(spec)
    return (top, mantissa_span(spec) // 2) if spec['has_inf'] else (top, full_mantissa_field(spec))


def fields_to_fraction(spec, exponent_field, mantissa_field):
    """Exact value of a (exponent, mantissa) field pair, as a Fraction."""
    scale = spec['mantissa']
    if exponent_field == 0 and has_subnormals(spec):
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


def overflow_fields(spec, sign, overflow_mode):
    """(sign, exponent, mantissa) for a magnitude that ran out of range.

    `saturate` always clamps. `overflow` produces Infinity when the format has
    one, else NaN when it has a pattern to spare for one, else it clamps too.
    A produced NaN carries sign 0, matching the library.
    """
    if overflow_mode == 'overflow':
        if spec['has_inf']:
            return (sign, max_exponent_field(spec), 0)
        if has_nan_encoding(spec):
            return (0,) + nan_fields(spec)
    return (sign,) + max_normal_fields(spec)


def finalize_fields(spec, sign, exponent_field, mantissa_field, mode,
                    overflow_mode='__default__'):
    """Apply mantissa carry, overflow and OCP special-value rules."""
    if overflow_mode == '__default__':
        overflow_mode = default_overflow_mode(spec)

    if mantissa_field >= mantissa_span(spec):
        mantissa_field = 0
        exponent_field += 1

    top = max_exponent_field(spec)
    # Rounding INTO the reserved all-ones-mantissa NaN slot at maxExponent is
    # an overflow too: that slot is not a representable finite value.
    reserved_nan_slot = (spec['has_nan'] and not spec['has_inf']
                         and exponent_field == top
                         and mantissa_field >= full_mantissa_field(spec))

    if (exponent_field > top
            or (exponent_field == top and spec['has_inf'])
            or reserved_nan_slot):
        # IEEE 754 §7.4 outranks the saturation mode: a directed mode pointing
        # toward zero may never produce an infinity.
        should_clamp = (mode == 'towardZero'
                        or (mode == 'towardNegative' and sign == 0)
                        or (mode == 'towardPositive' and sign == 1))
        if should_clamp:
            return (sign,) + max_normal_fields(spec)
        return overflow_fields(spec, sign, overflow_mode)

    return (sign, exponent_field, mantissa_field)


def default_overflow_mode(spec):
    return 'overflow' if spec['has_inf'] else 'saturate'


def round_to_format(magnitude, sign, spec, mode, overflow_mode='__default__'):
    """Correctly round an exact positive Fraction to (sign, exponent, mantissa)."""
    # An unsigned format clamps every negative magnitude to its smallest
    # representable value, which is exponent field 0 either way.
    if spec.get('unsigned') and sign == 1:
        return (0, 0, 0)

    if magnitude == 0:
        return (sign, 0, 0)

    # Unique e with 2^e <= magnitude < 2^(e+1). The bit-length difference is
    # either e or e+1, so verify and correct.
    exponent = magnitude.numerator.bit_length() - magnitude.denominator.bit_length()
    if magnitude < TWO ** exponent:
        exponent -= 1

    if exponent + spec['bias'] > max_exponent_field(spec):
        return finalize_fields(spec, sign, max_exponent_field(spec) + 1, 0, mode,
                               overflow_mode)

    # A format with no subnormals has nothing below exponent field 0, so
    # anything under it saturates to the minimum representable magnitude.
    if not has_subnormals(spec) and exponent + spec['bias'] < 0:
        return (sign, 0, 0)

    # Subnormals share the fixed exponent 2^(1-bias); normals use their binade.
    subnormal = has_subnormals(spec) and exponent < min_exponent(spec)
    effective = min_exponent(spec) if subnormal else exponent
    scaled = magnitude * TWO ** (spec['mantissa'] - effective)
    significand = round_fraction(scaled, sign, mode)

    if subnormal:
        return finalize_fields(spec, sign, 0, significand, mode, overflow_mode)
    return finalize_fields(spec, sign, exponent + spec['bias'],
                           significand - mantissa_span(spec), mode, overflow_mode)


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
                sign, exponent, mantissa = round_to_format(magnitude, sign, spec, 'tiesToEven')
                vectors.append({
                    'format': name,
                    'input': text,
                    'expected': {'sign': sign, 'exponent': exponent, 'mantissa': mantissa},
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
            sign, exponent, mantissa = round_to_format(magnitude, sign, spec, mode)
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
        scale = 1 << spec.get('fraction_bits', 0)
        if spec['signed']:
            high = (1 << (spec['bits'] - 1)) - 1
            # MX §5.3.4 lets the most-negative encoding go unused so the range
            # stays symmetric.
            low = -high if spec.get('symmetric') else -(1 << (spec['bits'] - 1))
        else:
            low, high = 0, (1 << spec['bits']) - 1

        for text in inputs:
            sign, magnitude = decimal_to_fraction(text)
            for mode in ROUNDING_MODES:
                # Round on the SCALED magnitude so a fixed-point format rounds
                # at its own 1/2^fraction_bits grid, in a single step.
                value = round_fraction(magnitude * scale, sign, mode)
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


# ---------------------------------------------------------------------------
# Overflow behavior (OCP OFP8 Table 3 / MX Table 3).
#
# The interesting probes sit AROUND the top of the range, not far above it: the
# round-then-check ordering of OFP8 §5.2.1 means a value below max normal that
# rounds UP past it must still take the overflow path.
# ---------------------------------------------------------------------------

OVERFLOW_PROBE_FORMATS = [
    'fp32', 'fp16', 'fp8_e5m2', 'fp8_e4m3',
    'fp6_e3m2', 'fp6_e2m3', 'fp4_e2m1', 'e8m0',
]


def dyadic_to_decimal(value):
    """Exact decimal string for a positive dyadic Fraction."""
    if value.denominator == 1:
        return str(value.numerator)
    numerator, places = dyadic_to_scaled_int(value)
    return scaled_int_to_decimal(numerator, places)


def overflow_probe_magnitudes(spec):
    """Exact magnitudes straddling the top of the format's range."""
    exponent_field, mantissa_field = max_normal_fields(spec)
    max_value = fields_to_fraction(spec, exponent_field, mantissa_field)
    ulp = TWO ** (max_exponent(spec) - spec['mantissa'])
    midpoint = max_value + ulp / 2
    return [
        max_value,                 # exactly representable
        midpoint - ulp / 4,        # rounds back down to max normal
        midpoint,                  # the tie at the edge of the range
        midpoint + ulp / 4,        # rounds up out of range
        max_value * 2,             # unambiguously out of range
    ]


def generate_overflow_mode_vectors():
    """Every Table 3 cell, at every rounding mode, for both signs."""
    vectors = []
    for name in OVERFLOW_PROBE_FORMATS:
        spec = FLOAT_FORMATS[name]
        signs = [0] if spec.get('unsigned') else [0, 1]
        probes = [dyadic_to_decimal(m) for m in overflow_probe_magnitudes(spec)]
        probes.append('1e400')  # takes the out-of-range shortcut path

        for text in probes:
            for sign in signs:
                literal = ('-' + text) if sign else text
                _, magnitude = decimal_to_fraction(literal)
                for mode in ROUNDING_MODES:
                    for overflow_mode in OVERFLOW_MODES:
                        s, e, m = round_to_format(magnitude, sign, spec, mode, overflow_mode)
                        vectors.append({
                            'format': name,
                            'input': literal,
                            'roundingMode': mode,
                            'overflowMode': overflow_mode,
                            'expected': {'sign': s, 'exponent': e, 'mantissa': m},
                        })
    return vectors


def generate_e8m0_vectors():
    """Every E8M0 encoding, and a spread of decimals encoded into it."""
    spec = FLOAT_FORMATS['e8m0']
    decode_vectors = []
    for field in range(256):
        if field == max_exponent_field(spec):
            decode_vectors.append({'exponent': field, 'expected': 'NaN'})
            continue
        decode_vectors.append({
            'exponent': field,
            'expected': float(Fraction(1) * TWO ** (field - spec['bias'])),
        })

    encode_inputs = ['0', '1', '2', '4', '0.5', '1.5', '1.25', '3', '1e-60', '1e40',
                     '-4', '340282366920938463463374607431768211456']
    encode_vectors = []
    for text in encode_inputs:
        sign, magnitude = decimal_to_fraction(text)
        for mode in ROUNDING_MODES:
            s, e, m = round_to_format(magnitude, sign, spec, mode)
            encode_vectors.append({
                'input': text,
                'roundingMode': mode,
                'expected': {'sign': s, 'exponent': e, 'mantissa': m},
            })

    return decode_vectors, encode_vectors


def generate_mxint8_vectors():
    """Every MXINT8 encoding, and a spread of decimals encoded into it."""
    spec = INTEGER_FORMATS['mxint8']
    scale = 1 << spec['fraction_bits']
    span = 1 << spec['bits']

    decode_vectors = []
    for raw in range(span):
        value = raw - span if raw >= span // 2 else raw
        decode_vectors.append({'raw': raw, 'expected': value / scale})

    encode_inputs = ['0', '1', '-1', '1.5', '-1.5', '0.015625', '-0.015625',
                     '1.984375', '-1.984375', '-2', '2', '10', '-10',
                     '0.0078125', '-0.0078125', '0.0234375', '1e30000', '1e-30000',
                     '-1e-30000']
    encode_vectors = []
    for text in encode_inputs:
        sign, magnitude = decimal_to_fraction(text)
        for mode in ROUNDING_MODES:
            value = round_fraction(magnitude * scale, sign, mode)
            if sign:
                value = -value
            high = (span // 2) - 1
            low = -high if spec['symmetric'] else -(span // 2)
            value = max(low, min(high, value))
            encode_vectors.append({
                'input': text,
                'roundingMode': mode,
                'expected': value,
            })

    return decode_vectors, encode_vectors


def generate_test_vectors():
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

    # OCP conformance: overflow behavior and the two MX scalar types.
    vectors['overflow_mode_encode'] = generate_overflow_mode_vectors()
    e8m0_decode, e8m0_encode = generate_e8m0_vectors()
    vectors['e8m0_decode'] = e8m0_decode
    vectors['e8m0_encode'] = e8m0_encode
    mxint8_decode, mxint8_encode = generate_mxint8_vectors()
    vectors['mxint8_decode'] = mxint8_decode
    vectors['mxint8_string_encode'] = mxint8_encode

    return vectors

def main():
    vectors = generate_test_vectors()
    print(json.dumps(vectors, indent=2))

if __name__ == '__main__':
    main()
