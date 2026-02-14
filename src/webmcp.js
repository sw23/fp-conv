/****************************************************************
 * Copyright 2025 Spencer Williams
 * Use of this source code is governed by an MIT license:
 * https://github.com/sw23/fp-conv/blob/main/LICENSE
 ****************************************************************/

/* global FloatingPoint, Integer, FORMATS */
// WebMCP integration - requires FloatingPoint, Integer, and FORMATS from floating-point.js

// In Node.js (testing), import from the library; in browser, rely on globals.
let _FloatingPoint, _Integer, _FORMATS;
if (typeof require !== 'undefined') {
    const lib = require('../lib/floating-point.js');
    _FloatingPoint = lib.FloatingPoint;
    _Integer = lib.Integer;
    _FORMATS = lib.FORMATS;
} else {
    /* istanbul ignore next */
    _FloatingPoint = FloatingPoint;
    /* istanbul ignore next */
    _Integer = Integer;
    /* istanbul ignore next */
    _FORMATS = FORMATS;
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
        const preset = _FORMATS[formatSpec];
        if (!preset) {
            throw new Error(`Unknown format preset: "${formatSpec}". Use the list_formats tool to see available presets.`);
        }
        if (preset.isInteger) {
            return new _Integer(preset.bits, preset.signed);
        }
        return new _FloatingPoint(preset.sign, preset.exponent, preset.mantissa, {
            bias: preset.bias,
            hasInfinity: preset.hasInfinity,
            hasNaN: preset.hasNaN,
        });
    }

    if (typeof formatSpec === 'object' && formatSpec !== null) {
        // Integer format: { bits, signed }
        if (formatSpec.isInteger || (formatSpec.bits !== undefined && formatSpec.exponentBits === undefined)) {
            const bits = formatSpec.bits;
            const signed = formatSpec.signed !== undefined ? formatSpec.signed : true;
            if (typeof bits !== 'number' || bits < 1 || bits > 64) {
                throw new Error('Integer format "bits" must be a number between 1 and 64.');
            }
            return new _Integer(bits, signed);
        }

        // Floating-point format: { signBits, exponentBits, mantissaBits, ... }
        const signBits = formatSpec.signBits !== undefined ? formatSpec.signBits : 1;
        const exponentBits = formatSpec.exponentBits;
        const mantissaBits = formatSpec.mantissaBits;

        if (exponentBits === undefined || mantissaBits === undefined) {
            throw new Error('Custom floating-point format requires "exponentBits" and "mantissaBits".');
        }

        return new _FloatingPoint(signBits, exponentBits, mantissaBits, {
            bias: formatSpec.bias,
            hasInfinity: formatSpec.hasInfinity,
            hasNaN: formatSpec.hasNaN,
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
        return value > 0 ? 'Positive Integer' : 'Negative Integer';
    }

    if (format.exponentBits === 0) {
        if (mantissa === 0) return sign ? '-Zero' : '+Zero';
        return 'Fixed-point';
    }

    if (exponent === format.maxExponent) {
        if (format.hasNaN && mantissa !== 0) return 'NaN';
        if (format.hasInfinity && mantissa === 0) return sign ? '-Infinity' : '+Infinity';
    }
    if (exponent === 0) {
        if (mantissa === 0) return sign ? '-Zero' : '+Zero';
        return 'Subnormal';
    }
    return 'Normal';
}

/**
 * Calculate the decimal mantissa value for display.
 */
function mantissaDecimal(format, exponent, mantissa) {
    if (format.isInteger) return format.decode(0, 0, mantissa);
    if (format.mantissaBits === 0) return exponent === 0 ? 0 : 1.0;
    const denom = Math.pow(2, format.mantissaBits);
    return exponent === 0
        ? mantissa / denom
        : 1.0 + mantissa / denom;
}

/**
 * Format the actual exponent string (e.g. "128 - 127 = 1").
 */
function exponentActual(format, exponent) {
    if (format.isInteger) return 'N/A';
    if (format.exponentBits === 0) return 'N/A';
    if (exponent === 0) return `1 - ${format.bias} = ${1 - format.bias}`;
    if (exponent === format.maxExponent && (format.hasInfinity || format.hasNaN)) return 'Special';
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

        // Hex string
        if (lower.startsWith('0x')) {
            const parsed = parseInt(lower, 16);
            if (isNaN(parsed)) throw new Error(`Invalid hex value: "${input}"`);
            return parsed;
        }

        // Try decimal parse
        const num = Number(input);
        if (!isNaN(num) || lower === 'nan') return num;

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
        stats.exponentActual = exponentActual(format, exponent);
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
    const categories = {
        'IEEE 754': ['fp64', 'fp32', 'fp16'],
        'ML': ['bf16', 'tf32', 'fp8_e4m3', 'fp8_e5m2', 'fp8_e8m0'],
        'OCP Microscaling': ['fp4_e2m1', 'fp6_e2m3', 'fp6_e3m2', 'fp8_e4m3_ocp', 'fp8_e5m2_ocp'],
        'Integer': ['int32', 'uint32', 'int16', 'uint16', 'int8', 'uint8', 'int4', 'uint4'],
    };

    const formats = [];
    for (const [category, keys] of Object.entries(categories)) {
        for (const key of keys) {
            const f = _FORMATS[key];
            const entry = { key, name: f.name, category };

            if (f.isInteger) {
                entry.bits = f.bits;
                entry.signed = f.signed;
                entry.isInteger = true;
            } else {
                entry.signBits = f.sign;
                entry.exponentBits = f.exponent;
                entry.mantissaBits = f.mantissa;
                entry.totalBits = f.sign + f.exponent + f.mantissa;
                entry.hasInfinity = f.hasInfinity !== false;
                entry.hasNaN = f.hasNaN !== false;
                if (f.bias !== undefined) entry.bias = f.bias;
            }

            formats.push(entry);
        }
    }

    return { content: [{ type: 'text', text: JSON.stringify(formats, null, 2) }] };
}

/**
 * encode_number – Encode a decimal/keyword value into a format.
 */
function encodeNumber({ value, format: formatSpec }) {
    if (value === undefined || value === null) {
        throw new Error('Parameter "value" is required.');
    }
    if (!formatSpec) {
        throw new Error('Parameter "format" is required.');
    }

    const format = resolveFormat(formatSpec);
    const numericValue = parseValueInput(value);
    const encoded = format.encode(numericValue);
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
        const binary = BigInt('0x' + hexDigits).toString(2).padStart(format.totalBits, '0');
        ({ sign, exponent, mantissa } = extractComponents(binary, format));
    } else if (/^[01]+$/.test(bitString)) {
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
        return { sign: 0, exponent: 0, mantissa: parseInt(binary, 2) || 0 };
    }
    let idx = 0;
    const sign = format.signBits ? parseInt(binary.substring(idx, idx + format.signBits), 2) : 0;
    idx += format.signBits;
    const exponent = format.exponentBits > 0
        ? parseInt(binary.substring(idx, idx + format.exponentBits), 2)
        : 0;
    idx += format.exponentBits;
    const mantissa = format.mantissaBits > 0
        ? parseInt(binary.substring(idx, idx + format.mantissaBits), 2)
        : 0;
    return { sign, exponent, mantissa };
}

/**
 * convert_format – Convert a value between two formats.
 */
function convertFormat({ value, inputFormat: inputSpec, outputFormat: outputSpec }) {
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

    // Encode in input format, decode to get actual representable value
    const inputEncoded = inFmt.encode(numericValue);
    const inputActual = inFmt.decode(inputEncoded.sign, inputEncoded.exponent, inputEncoded.mantissa);

    // Re-encode in output format
    const outputEncoded = outFmt.encode(inputActual);
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
    };

    if (format.isInteger) {
        info.type = 'integer';
        info.bits = format.bits;
        info.signed = format.signed;
        info.minValue = format.minValue;
        info.maxValue = format.maxValue;
    } else {
        info.type = 'floating-point';
        info.signBits = format.signBits;
        info.exponentBits = format.exponentBits;
        info.mantissaBits = format.mantissaBits;
        info.bias = format.bias;
        info.hasInfinity = format.hasInfinity;
        info.hasNaN = format.hasNaN;

        if (format.exponentBits > 0) {
            // Max normal
            const maxExp = format.hasInfinity || format.hasNaN
                ? format.maxExponent - 1
                : format.maxExponent;
            const maxMantissa = format.mantissaBits > 0
                ? (Math.pow(2, format.mantissaBits) - 1)
                : 0;
            info.maxNormal = format.decode(0, maxExp, maxMantissa);

            // Min normal
            info.minNormal = format.decode(0, 1, 0);

            // Subnormals
            if (format.mantissaBits > 0) {
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
 * Build the array of tool descriptors used by provideContext.
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
            execute: () => listFormats(),
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
                            'For floating-point: { signBits, exponentBits, mantissaBits, bias?, hasInfinity?, hasNaN? }. ' +
                            'For integer: { bits, signed }.',
                    },
                },
                required: ['value', 'format'],
            },
            execute: (params) => encodeNumber(params),
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
            execute: (params) => decodeBits(params),
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
                },
                required: ['value', 'inputFormat', 'outputFormat'],
            },
            execute: (params) => convertFormat(params),
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
            execute: (params) => getFormatInfo(params),
        },
    ];
}

/**
 * Register tools with the WebMCP API if the browser supports it.
 */
function registerWebMCP() {
    if (typeof window === 'undefined' ||
        !window.navigator ||
        !window.navigator.modelContext) {
        return false;
    }

    const tools = buildToolDescriptors();
    window.navigator.modelContext.provideContext({ tools });
    return true;
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
