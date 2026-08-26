// Copyright (c) 2025 Spencer Williams
// Licensed under the MIT License.

/* global FloatingPoint, Integer, FORMATS, ROUNDING_MODES */
// WebMCP integration - requires FloatingPoint, Integer, FORMATS, and ROUNDING_MODES from floating-point.js

// In Node.js (testing), import from the library; in browser, rely on globals.
//
// The alias names carry a per-file prefix on purpose. index.html loads this and
// src/url-state.js as CLASSIC scripts, which share one global lexical
// environment, so a top-level `let`/`const`/`class` of the same name in two of
// them is a redeclaration and throws SyntaxError before the second file runs at
// all. tests/browser-scripts.test.js enforces that the names stay disjoint.
let _mcpFloatingPoint, _mcpInteger, _mcpFORMATS, _mcpROUNDING_MODES;
if (typeof require !== 'undefined') {
    const lib = require('../lib/floating-point.js');
    _mcpFloatingPoint = lib.FloatingPoint;
    _mcpInteger = lib.Integer;
    _mcpFORMATS = lib.FORMATS;
    _mcpROUNDING_MODES = lib.ROUNDING_MODES;
} else {
    /* istanbul ignore next */
    _mcpFloatingPoint = FloatingPoint;
    /* istanbul ignore next */
    _mcpInteger = Integer;
    /* istanbul ignore next */
    _mcpFORMATS = FORMATS;
    /* istanbul ignore next */
    _mcpROUNDING_MODES = ROUNDING_MODES;
}

/**
 * Resolve a format specification to a FloatingPoint or Integer instance.
 * Accepts either a preset key string (e.g. "fp16", "int8") or a custom
 * format object with explicit parameters.
 *
 * @param {string|object} formatSpec - Preset key or custom format descriptor
 * @returns {FloatingPoint|Integer} Format instance
 * @throws {Error} If the format specification is invalid
 */
function resolveFormat(formatSpec) {
    if (typeof formatSpec === 'string') {
        let preset = _mcpFORMATS[formatSpec];
        if (!preset) {
            // Fall back to a normalized lookup so common variants (e.g. the
            // hyphenated, mixed-case spelling "FP8-E4M3" used in web URLs)
            // resolve to the canonical underscore key "fp8_e4m3".
            const normalized = formatSpec.toLowerCase().replace(/-/g, '_');
            preset = _mcpFORMATS[normalized];
        }
        if (!preset) {
            throw new Error(`Unknown format preset: "${formatSpec}". Use the list_formats tool to see available presets.`);
        }
        if (preset.isInteger) {
            return new _mcpInteger(preset.bits, preset.signed, {
                fractionBits: preset.fractionBits,
                symmetric: preset.symmetric,
            });
        }
        return new _mcpFloatingPoint(preset.sign, preset.exponent, preset.mantissa, {
            bias: preset.bias,
            hasInfinity: preset.hasInfinity,
            hasNaN: preset.hasNaN,
            hasSubnormals: preset.hasSubnormals,
        });
    }

    if (typeof formatSpec === 'object' && formatSpec !== null) {
        // Integer format: { bits, signed, fractionBits?, symmetric? }
        if (formatSpec.isInteger || (formatSpec.bits !== undefined && formatSpec.exponentBits === undefined)) {
            const bits = formatSpec.bits;
            const signed = formatSpec.signed !== undefined ? formatSpec.signed : true;
            if (!Number.isInteger(bits) || bits < 1 || bits > 64) {
                throw new Error('Integer format "bits" must be an integer between 1 and 64.');
            }
            const fractionBits = formatSpec.fractionBits || 0;
            if (!Number.isInteger(fractionBits) || fractionBits < 0 || fractionBits > bits - 1) {
                throw new Error(
                    `Integer format "fractionBits" must be an integer between 0 and ${bits - 1}.`);
            }
            return new _mcpInteger(bits, signed, {
                fractionBits,
                symmetric: formatSpec.symmetric,
            });
        }

        // Floating-point format: { signBits, exponentBits, mantissaBits, ... }
        const signBits = formatSpec.signBits !== undefined ? formatSpec.signBits : 1;
        const exponentBits = formatSpec.exponentBits;
        const mantissaBits = formatSpec.mantissaBits;

        if (exponentBits === undefined || mantissaBits === undefined) {
            throw new Error('Custom floating-point format requires "exponentBits" and "mantissaBits".');
        }

        if (!Number.isInteger(signBits) || signBits < 0 || signBits > 1) {
            throw new Error('"signBits" must be 0 or 1.');
        }
        if (!Number.isInteger(exponentBits) || exponentBits < 0) {
            throw new Error('"exponentBits" must be a non-negative integer.');
        }
        if (!Number.isInteger(mantissaBits) || mantissaBits < 0) {
            throw new Error('"mantissaBits" must be a non-negative integer.');
        }

        return new _mcpFloatingPoint(signBits, exponentBits, mantissaBits, {
            bias: formatSpec.bias,
            hasInfinity: formatSpec.hasInfinity,
            hasNaN: formatSpec.hasNaN,
            hasSubnormals: formatSpec.hasSubnormals,
        });
    }

    throw new Error('Format must be a preset key string (e.g. "fp16") or a custom format object.');
}

/**
 * Determine the classification of a value within a given format.
 */
function classifyValue(format, sign, exponent, mantissa) {
    if (format.isInteger) {
        const value = format.decode(sign, exponent, mantissa);
        if (value === 0) return 'Zero';
        // A format with an implicit scale (MXINT8) does not hold integers.
        const noun = format.fractionBits ? 'Fixed-point' : 'Integer';
        return value > 0 ? `Positive ${noun}` : `Negative ${noun}`;
    }

    if (format.exponentBits === 0) {
        if (mantissa === 0) return sign ? '-Zero' : '+Zero';
        return 'Fixed-point';
    }

    const kind = format.classify(sign, exponent, mantissa);
    switch (kind) {
        case 'Zero': return sign ? '-Zero' : '+Zero';
        case 'Infinity': return sign ? '-Infinity' : '+Infinity';
        case 'NaN': return 'NaN';
        default: return kind; // 'Normal' | 'Subnormal'
    }
}

/**
 * Calculate the decimal mantissa value for display.
 *
 * Exponent field 0 only carries the implicit-bit-less "0.x" significand in a
 * format that HAS a subnormal regime. Where it does not (E8M0), field 0 is an
 * ordinary normal binade and its significand is 1.x like any other.
 */
function mantissaDecimal(format, exponent, mantissa) {
    if (format.isInteger) return format.decode(0, 0, mantissa);
    const subnormalRegime = exponent === 0 && format.hasSubnormals;
    if (format.mantissaBits === 0) return subnormalRegime ? 0 : 1.0;
    const denom = Math.pow(2, format.mantissaBits);
    return subnormalRegime
        ? mantissa / denom
        : 1.0 + mantissa / denom;
}

/**
 * Format the actual exponent string (e.g. "128 - 127 = 1").
 */
function exponentActual(format, exponent, mantissa = 0) {
    if (format.isInteger) return 'N/A';
    if (format.exponentBits === 0) return 'N/A';
    // Subnormals share the smallest normal's exponent, 1 - bias. A format with
    // no subnormals uses field 0 as a normal binade of its own, so it falls
    // through to the ordinary formula and reads 0 - bias.
    if (exponent === 0 && format.hasSubnormals) {
        return `1 - ${format.bias} = ${1 - format.bias}`;
    }
    if (exponent === format.maxExponent) {
        // Only genuine Infinity/NaN encodings have a "Special" exponent; a
        // normal value living at maxExponent (OCP-style) shows the real value.
        const kind = format.classify(0, exponent, mantissa);
        if (kind === 'Infinity' || kind === 'NaN') return 'Special';
    }
    return `${exponent} - ${format.bias} = ${exponent - format.bias}`;
}

/**
 * Parse a value input which may be a number, hex string, binary string,
 * or special keyword.
 */
function parseValueInput(input) {
    if (typeof input === 'number') return input;

    if (typeof input === 'string') {
        const lower = input.toLowerCase().trim();
        // Special keywords
        if (lower === 'infinity' || lower === '+infinity' || lower === '+inf' || lower === 'inf') return Infinity;
        if (lower === '-infinity' || lower === '-inf') return -Infinity;
        if (lower === 'nan') return NaN;

        // Reject empty/whitespace-only input (Number("") === 0 would hide it).
        if (lower === '') {
            throw new Error('Value cannot be empty.');
        }

        // Hex string
        if (lower.startsWith('0x')) {
            if (!/^0x[0-9a-f]+$/.test(lower)) {
                throw new Error(`Invalid hex value: "${input}"`);
            }
            const parsed = parseInt(lower, 16);
            if (parsed > Number.MAX_SAFE_INTEGER) {
                throw new Error(
                    `Hex value "${input}" exceeds the safe integer range; ` +
                    'use decode_bits to inspect wide bit patterns.');
            }
            return parsed;
        }

        // Try decimal parse
        const num = Number(input);
        if (!isNaN(num)) return num;

        throw new Error(`Cannot parse value: "${input}". Provide a number, hex (0x…), or keyword (infinity, nan).`);
    }

    throw new Error('Value must be a number or string.');
}

/**
 * Build the full statistics object for an encoded value in a given format.
 */
function jsonSafeNumber(value) {
    if (value === Infinity) return 'Infinity';
    if (value === -Infinity) return '-Infinity';
    if (Number.isNaN(value)) return 'NaN';
    return value;
}

function buildStats(format, encoded) {
    const { sign, exponent, mantissa } = encoded;
    const binary = format.toBinaryString(sign, exponent, mantissa);
    const hex = format.toHexString(sign, exponent, mantissa);
    const type = classifyValue(format, sign, exponent, mantissa);
    const actualValue = format.decode(sign, exponent, mantissa);

    const stats = {
        binary,
        hex,
        sign,
        type,
        actualValue: jsonSafeNumber(actualValue),
    };

    if (format.isInteger) {
        stats.totalBits = format.totalBits;
        stats.signed = format.signed;
    } else {
        stats.exponentBiased = exponent;
        stats.exponentActual = exponentActual(format, exponent, mantissa);
        stats.mantissaDecimal = mantissaDecimal(format, exponent, mantissa);
        stats.totalBits = format.totalBits;
        stats.signBits = format.signBits;
        stats.exponentBits = format.exponentBits;
        stats.mantissaBits = format.mantissaBits;
        stats.bias = format.bias;
    }

    return stats;
}

// ── Tool implementations ──────────────────────────────────────────

/**
 * list_formats – Return every available preset format.
 */
function listFormats() {
    // Derived from the single FORMATS catalog so new presets appear automatically
    // and category labels can never drift out of sync.
    const CATEGORY_LABELS = {
        ieee: 'IEEE 754',
        ml: 'ML',
        ocp: 'OCP',
        integer: 'Integer',
    };
    const CATEGORY_ORDER = ['ieee', 'ml', 'ocp', 'integer'];

    const formats = [];
    for (const category of CATEGORY_ORDER) {
        for (const [key, f] of Object.entries(_mcpFORMATS)) {
            if (f.category !== category) continue;
            const entry = { key, name: f.name, category: CATEGORY_LABELS[category] };
            const instance = resolveFormat(key);

            if (f.isInteger) {
                entry.bits = f.bits;
                entry.signed = f.signed;
                entry.isInteger = true;
                if (f.fractionBits) {
                    entry.fractionBits = f.fractionBits;
                    entry.implicitScale = `2^-${f.fractionBits}`;
                }
                if (f.symmetric) entry.symmetric = true;
                entry.minValue = instance.minRealValue;
                entry.maxValue = instance.maxRealValue;
            } else {
                entry.signBits = f.sign;
                entry.exponentBits = f.exponent;
                entry.mantissaBits = f.mantissa;
                entry.totalBits = f.sign + f.exponent + f.mantissa;
                entry.hasInfinity = f.hasInfinity !== false;
                entry.hasNaN = f.hasNaN !== false;
                entry.hasSubnormals = f.hasSubnormals !== false;
                if (f.bias !== undefined) entry.bias = f.bias;
            }

            // What an out-of-range magnitude becomes, so an agent can explain
            // the same resolution the web UI shows.
            entry.defaultOverflowMode = instance.defaultOverflowMode;
            entry.overflowTarget = {
                saturate: instance.overflowTarget('saturate'),
                overflow: instance.overflowTarget('overflow'),
            };

            formats.push(entry);
        }
    }

    return { content: [{ type: 'text', text: JSON.stringify(formats, null, 2) }] };
}

/**
 * Normalize a caller-supplied value into something the encoders can round exactly.
 *
 * A plain decimal literal is handed on as a STRING on purpose: the encoders
 * round a decimal string straight to the target format, avoiding the double
 * rounding of decimal -> fp64 -> format that can pick the wrong neighbour when
 * the decimal sits just off a target-format midpoint.
 *
 * Everything else (keywords like "inf", hex bit patterns, plain numbers) has no
 * exact decimal form and has to be normalized to a number first - Number("inf")
 * is NaN, so the encoders cannot be left to parse those themselves.
 */
function encodeInput(value, numericValue) {
    return _mcpFloatingPoint.isDecimalLiteral(value) ? value : numericValue;
}

/**
 * encode_number – Encode a decimal/keyword value into a format.
 */
function encodeNumber({ value, format: formatSpec, roundingMode, overflowMode }) {
    if (value === undefined || value === null) {
        throw new Error('Parameter "value" is required.');
    }
    if (!formatSpec) {
        throw new Error('Parameter "format" is required.');
    }

    const format = resolveFormat(formatSpec);
    const numericValue = parseValueInput(value);
    const encodeOptions = {};
    if (roundingMode) encodeOptions.roundingMode = roundingMode;
    if (overflowMode) encodeOptions.overflowMode = overflowMode;
    const encoded = format.encode(encodeInput(value, numericValue), encodeOptions);
    const stats = buildStats(format, encoded);

    return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
}

/**
 * decode_bits – Decode a binary or hex bit-pattern.
 */
function decodeBits({ bits, format: formatSpec }) {
    if (bits === undefined || bits === null) {
        throw new Error('Parameter "bits" is required.');
    }
    if (!formatSpec) {
        throw new Error('Parameter "format" is required.');
    }

    const format = resolveFormat(formatSpec);
    const bitString = String(bits);

    let sign, exponent, mantissa;

    if (bitString.toLowerCase().startsWith('0x')) {
        // Hex → binary (BigInt-safe for 64-bit and beyond)
        const hexDigits = bitString.substring(2).trim();
        if (!/^[0-9a-fA-F]+$/.test(hexDigits)) {
            throw new Error(`Invalid hex value: "${bitString}"`);
        }
        const significant = BigInt('0x' + hexDigits).toString(2);
        if (significant.length > format.totalBits) {
            throw new Error(
                `Bit pattern "${bitString}" has ${significant.length} significant bits, ` +
                `which does not fit the ${format.totalBits}-bit format.`);
        }
        const binary = significant.padStart(format.totalBits, '0');
        ({ sign, exponent, mantissa } = extractComponents(binary, format));
    } else if (/^[01]+$/.test(bitString)) {
        // A binary pattern is an exact bit layout: reject anything wider than
        // the format (a caller passing a 32-bit string to fp16 almost certainly
        // meant fp32). Leading zeros are only tolerated for hex input above.
        if (bitString.length > format.totalBits) {
            throw new Error(
                `Binary pattern "${bitString}" is ${bitString.length} bits wide, ` +
                `which does not fit the ${format.totalBits}-bit format.`);
        }
        const padded = bitString.padStart(format.totalBits, '0');
        ({ sign, exponent, mantissa } = extractComponents(padded, format));
    } else {
        throw new Error('Parameter "bits" must be a binary string (e.g. "01000000") or hex string (e.g. "0x40").');
    }

    const encoded = { sign, exponent, mantissa };
    const stats = buildStats(format, encoded);

    return { content: [{ type: 'text', text: JSON.stringify(stats, null, 2) }] };
}

/**
 * Extract sign, exponent, mantissa from a full binary string.
 */
function extractComponents(binary, format) {
    if (format.isInteger) {
        return { sign: 0, exponent: 0, mantissa: Number(BigInt('0b' + binary)) };
    }
    let idx = 0;
    const sign = format.signBits ? parseInt(binary.substring(idx, idx + format.signBits), 2) : 0;
    idx += format.signBits;
    const exponent = format.exponentBits > 0
        ? parseInt(binary.substring(idx, idx + format.exponentBits), 2)
        : 0;
    idx += format.exponentBits;
    const mantissa = format.mantissaBits > 0
        ? Number(BigInt('0b' + binary.substring(idx, idx + format.mantissaBits)))
        : 0;
    return { sign, exponent, mantissa };
}

/**
 * convert_format – Convert a value between two formats.
 */
function convertFormat({ value, inputFormat: inputSpec, outputFormat: outputSpec, roundingMode, overflowMode }) {
    if (value === undefined || value === null) {
        throw new Error('Parameter "value" is required.');
    }
    if (!inputSpec) {
        throw new Error('Parameter "inputFormat" is required.');
    }
    if (!outputSpec) {
        throw new Error('Parameter "outputFormat" is required.');
    }

    const inFmt = resolveFormat(inputSpec);
    const outFmt = resolveFormat(outputSpec);
    const numericValue = parseValueInput(value);
    const outputEncodeOptions = {};
    if (roundingMode) outputEncodeOptions.roundingMode = roundingMode;
    if (overflowMode) outputEncodeOptions.overflowMode = overflowMode;

    // Construct the source operand using the input format's standard defaults.
    // Rounding and overflow options describe the conversion to the destination;
    // changing them must not mutate the value being converted.
    const inputEncoded = inFmt.encode(encodeInput(value, numericValue));
    const inputActual = inFmt.decode(inputEncoded.sign, inputEncoded.exponent, inputEncoded.mantissa);

    // Re-encode in output format
    const outputEncoded = outFmt.encode(inputActual, outputEncodeOptions);
    const outputActual = outFmt.decode(outputEncoded.sign, outputEncoded.exponent, outputEncoded.mantissa);

    const inputStats = buildStats(inFmt, inputEncoded);
    const outputStats = buildStats(outFmt, outputEncoded);

    // Precision loss
    const absoluteLoss = Math.abs(inputActual - outputActual);
    const relativeLossPercent = inputActual !== 0
        ? (absoluteLoss / Math.abs(inputActual)) * 100
        : 0;

    const result = {
        input: inputStats,
        output: outputStats,
        precisionLoss: {
            absolute: jsonSafeNumber(absoluteLoss),
            relativePercent: jsonSafeNumber(Number(relativeLossPercent.toFixed(6))),
            lossless: absoluteLoss === 0 || isNaN(absoluteLoss),
        },
    };

    return { content: [{ type: 'text', text: JSON.stringify(result, null, 2) }] };
}

/**
 * get_format_info – Return detailed information about a format.
 */
function getFormatInfo({ format: formatSpec }) {
    if (!formatSpec) {
        throw new Error('Parameter "format" is required.');
    }
    const format = resolveFormat(formatSpec);

    const info = {
        totalBits: format.totalBits,
        defaultOverflowMode: format.defaultOverflowMode,
        overflowTarget: {
            saturate: format.overflowTarget('saturate'),
            overflow: format.overflowTarget('overflow'),
        },
    };

    if (format.isInteger) {
        info.type = 'integer';
        info.bits = format.bits;
        info.signed = format.signed;
        if (format.fractionBits) {
            info.fractionBits = format.fractionBits;
            info.implicitScale = `2^-${format.fractionBits}`;
            info.symmetric = format.symmetric;
        }
        info.minValue = format.minRealValue;
        info.maxValue = format.maxRealValue;
        info.rawMinValue = format.minValue;
        info.rawMaxValue = format.maxValue;
    } else {
        info.type = 'floating-point';
        info.signBits = format.signBits;
        info.exponentBits = format.exponentBits;
        info.mantissaBits = format.mantissaBits;
        info.bias = format.bias;
        info.hasInfinity = format.hasInfinity;
        info.hasNaN = format.hasNaN;
        info.hasSubnormals = format.hasSubnormals;

        if (format.exponentBits > 0) {
            // Max normal (delegated to the engine so OCP-style formats whose
            // largest normal lives at maxExponent — e.g. E4M3 max = 448 — are
            // reported correctly).
            const mn = format.getMaxNormal(false);
            info.maxNormal = format.decode(mn.sign, mn.exponent, mn.mantissa);

            // Min normal. A format with no subnormals uses exponent field 0 as
            // its smallest normal binade rather than reserving it.
            info.minNormal = format.decode(0, format.hasSubnormals ? 1 : 0, 0);

            // Subnormals
            if (format.mantissaBits > 0 && format.hasSubnormals) {
                const maxMantissa = Math.pow(2, format.mantissaBits) - 1;
                info.maxSubnormal = format.decode(0, 0, maxMantissa);
                info.minSubnormal = format.decode(0, 0, 1);
            }
        } else {
            // Fixed-point
            if (format.mantissaBits > 0) {
                info.maxValue = format.decode(0, 0, (Math.pow(2, format.mantissaBits) - 1));
                info.minValue = format.signBits ? -info.maxValue : 0;
            }
        }
    }

    return { content: [{ type: 'text', text: JSON.stringify(info, null, 2) }] };
}

// ── WebMCP registration ───────────────────────────────────────────

/**
 * Build the array of tool descriptors used by registerTool.
 */
function buildToolDescriptors() {
    return [
        {
            name: 'list_formats',
            description:
                'List all available floating-point and integer format presets supported by this converter. ' +
                'Returns format keys, names, categories, and parameters (bits, exponent, mantissa, etc.).',
            inputSchema: {
                type: 'object',
                properties: {},
                required: [],
            },
            execute: (_params, _agent) => listFormats(),
        },
        {
            name: 'encode_number',
            description:
                'Encode a decimal number (or special value like Infinity / NaN) into a specified ' +
                'floating-point or integer format. Returns binary, hex, and component breakdown.',
            inputSchema: {
                type: 'object',
                properties: {
                    value: {
                        type: ['number', 'string'],
                        description:
                            'The value to encode. Accepts a number, hex string (e.g. "0xFF"), ' +
                            'or keyword ("infinity", "-infinity", "nan").',
                    },
                    format: {
                        type: ['string', 'object'],
                        description:
                            'Format preset key (e.g. "fp32", "int8") or custom format object. ' +
                            'For floating-point: { signBits, exponentBits, mantissaBits, bias?, hasInfinity?, hasNaN?, hasSubnormals? }. ' +
                            'For integer: { bits, signed, fractionBits?, symmetric? }.',
                    },
                    roundingMode: {
                        type: 'string',
                        description:
                            'Rounding mode for encoding the output format. Source construction uses ' +
                            'the input format default. Options: "tiesToEven" (default, IEEE 754), ' +
                            '"tiesToAway", "towardZero", "towardPositive", "towardNegative".',
                        enum: ['tiesToEven', 'tiesToAway', 'towardZero', 'towardPositive', 'towardNegative'],
                    },
                    overflowMode: {
                        type: 'string',
                        description:
                            'What an out-of-range output magnitude becomes; source construction uses ' +
                            'the input format default. "overflow" produces Infinity ' +
                            '(or NaN when the format has no Infinity); "saturate" clamps to the ' +
                            'largest finite value. Omit to use the per-format default (overflow for ' +
                            'formats with Infinity, saturate otherwise). IEEE 754 §7.4 directed ' +
                            'rounding still clamps finite overflow regardless of this setting.',
                        enum: ['saturate', 'overflow'],
                    },
                },
                required: ['value', 'format'],
            },
            execute: (params, _agent) => encodeNumber(params),
        },
        {
            name: 'decode_bits',
            description:
                'Decode a binary or hexadecimal bit-pattern into a specified format. ' +
                'Returns the decimal value and full component breakdown.',
            inputSchema: {
                type: 'object',
                properties: {
                    bits: {
                        type: 'string',
                        description:
                            'Bit-pattern as a binary string (e.g. "0100000001001000") ' +
                            'or hex string with 0x prefix (e.g. "0x4048").',
                    },
                    format: {
                        type: ['string', 'object'],
                        description:
                            'Format preset key (e.g. "fp16") or custom format object.',
                    },
                },
                required: ['bits', 'format'],
            },
            execute: (params, _agent) => decodeBits(params),
        },
        {
            name: 'convert_format',
            description:
                'Convert a value from one floating-point or integer format to another. ' +
                'Returns full encoding details for both formats and precision loss analysis.',
            inputSchema: {
                type: 'object',
                properties: {
                    value: {
                        type: ['number', 'string'],
                        description:
                            'The value to convert. Accepts a number, hex string, or keyword.',
                    },
                    inputFormat: {
                        type: ['string', 'object'],
                        description:
                            'Source format preset key or custom format object.',
                    },
                    outputFormat: {
                        type: ['string', 'object'],
                        description:
                            'Target format preset key or custom format object.',
                    },
                    roundingMode: {
                        type: 'string',
                        description:
                            'Rounding mode for encoding. Options: "tiesToEven" (default, IEEE 754), ' +
                            '"tiesToAway", "towardZero", "towardPositive", "towardNegative".',
                        enum: ['tiesToEven', 'tiesToAway', 'towardZero', 'towardPositive', 'towardNegative'],
                    },
                    overflowMode: {
                        type: 'string',
                        description:
                            'What an out-of-range magnitude becomes. "overflow" produces Infinity ' +
                            '(or NaN when the format has no Infinity); "saturate" clamps to the ' +
                            'largest finite value. Omit to use the per-format default. IEEE 754 ' +
                            '§7.4 directed rounding still clamps finite overflow regardless.',
                        enum: ['saturate', 'overflow'],
                    },
                },
                required: ['value', 'inputFormat', 'outputFormat'],
            },
            execute: (params, _agent) => convertFormat(params),
        },
        {
            name: 'get_format_info',
            description:
                'Get detailed information about a floating-point or integer format, including ' +
                'value range (max/min normal, subnormal), bias, and special value support.',
            inputSchema: {
                type: 'object',
                properties: {
                    format: {
                        type: ['string', 'object'],
                        description:
                            'Format preset key (e.g. "bf16") or custom format object.',
                    },
                },
                required: ['format'],
            },
            execute: (params, _agent) => getFormatInfo(params),
        },
    ];
}

/**
 * Register tools with the WebMCP API if the browser supports it.
 * Returns an AbortController that can be used to unregister all tools,
 * or false if the browser does not support WebMCP.
 */
function registerWebMCP() {
    if (typeof window === 'undefined' ||
        !window.navigator ||
        !window.navigator.modelContext ||
        typeof window.navigator.modelContext.registerTool !== 'function') {
        return false;
    }

    const controller = new AbortController();
    const tools = buildToolDescriptors();
    for (const tool of tools) {
        window.navigator.modelContext.registerTool(tool, { signal: controller.signal });
    }
    return controller;
}

// Auto-register when loaded in a browser
if (typeof window !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', registerWebMCP);
    } else {
        registerWebMCP();
    }
}

// Export for Node.js (testing)
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        resolveFormat,
        classifyValue,
        mantissaDecimal,
        exponentActual,
        parseValueInput,
        encodeInput,
        jsonSafeNumber,
        buildStats,
        extractComponents,
        listFormats,
        encodeNumber,
        decodeBits,
        convertFormat,
        getFormatInfo,
        buildToolDescriptors,
        registerWebMCP,
    };
}
