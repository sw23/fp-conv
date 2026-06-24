// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

// Thin adapter over the shared conversion engine. The actual conversion logic
// lives in src/webmcp.js at the repository root and is the SAME code the web app
// and the MCP server use. Those functions return MCP-style envelopes
// ({ content: [{ type: "text", text: <json> }] }); here we unwrap them into
// plain objects the CLI can format for the terminal or emit as JSON.

import webmcp from "../../../src/webmcp.js";

const { listFormats, encodeNumber, decodeBits, convertFormat, getFormatInfo } = webmcp;

/**
 * Unwrap the MCP-style text envelope into a plain JavaScript object.
 * @param {{content: Array<{type: string, text: string}>}} result
 * @returns {object}
 */
function unwrap(result) {
    return JSON.parse(result.content[0].text);
}

/**
 * List every available preset format.
 * @returns {Array<object>}
 */
export function runList() {
    return unwrap(listFormats());
}

/**
 * Encode a decimal/keyword value into a format.
 * @param {{value: string, format: string|object, roundingMode?: string}} params
 * @returns {object}
 */
export function runEncode({ value, format, roundingMode }) {
    return unwrap(encodeNumber({ value, format, roundingMode }));
}

/**
 * Decode a binary or hex bit-pattern in a given format.
 * @param {{bits: string, format: string|object}} params
 * @returns {object}
 */
export function runDecode({ bits, format }) {
    return unwrap(decodeBits({ bits, format }));
}

/**
 * Convert a value from one format to another.
 * @param {{value: string, from: string|object, to: string|object, roundingMode?: string}} params
 * @returns {object}
 */
export function runConvert({ value, from, to, roundingMode }) {
    return unwrap(
        convertFormat({ value, inputFormat: from, outputFormat: to, roundingMode })
    );
}

/**
 * Get detailed information about a format.
 * @param {{format: string|object}} params
 * @returns {object}
 */
export function runInfo({ format }) {
    return unwrap(getFormatInfo({ format }));
}
