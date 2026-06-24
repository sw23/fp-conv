// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/* global __CLI_VERSION__ */

import { parseArgs as nodeParseArgs } from "node:util";

import { runEncode, runDecode, runConvert, runInfo, runList } from "./commands.js";
import { renderStats, renderConvert, renderInfo, renderList } from "./format.js";

// esbuild (see esbuild.config.mjs) replaces the __CLI_VERSION__ token with the
// package.json version at build time, keeping package.json as the single source
// of truth. Under tests (unbundled) the token is undefined, so fall back.
export const CLI_VERSION =
    typeof __CLI_VERSION__ === "string" ? __CLI_VERSION__ : "0.0.0";

export const CLI_NAME = "fp-conv";

const HELP = `${CLI_NAME} v${CLI_VERSION}

Cross-platform command-line tool for floating-point conversions.

Usage:
  fp-conv <command> [options]

Commands:
  encode <value>     Encode a decimal/keyword value into a format.
  decode <bits>      Decode a binary or hex bit-pattern in a format.
  convert <value>    Convert a value from one format to another.
  info <format>      Show range, bias, and special-value details for a format.
  list               List all available preset formats.

Options:
  -f, --format <fmt>   Format preset key (e.g. fp32, int8) or a JSON object
                       string for a custom format. Used by encode/decode.
      --from <fmt>     Source format for convert.
      --to <fmt>       Target format for convert.
  -r, --rounding <m>   Rounding mode: tiesToEven (default), tiesToAway,
                       towardZero, towardPositive, towardNegative.
      --json           Emit machine-readable JSON instead of formatted text.
  -h, --help           Show this help.
  -v, --version        Show version.

Values accept a number, hex (e.g. 0xFF), or keyword (infinity, -infinity, nan).
Bit-patterns accept a binary string (e.g. 0100000) or hex (e.g. 0x40).

Examples:
  fp-conv encode 3.14 --format fp32
  fp-conv decode 0x4048 --format fp16
  fp-conv convert 3.14 --from fp32 --to fp16
  fp-conv info bf16
  fp-conv list
  fp-conv encode 1.5 --format '{"signBits":1,"exponentBits":8,"mantissaBits":7}'`;

const OPTIONS = {
    format: { type: "string", short: "f" },
    from: { type: "string" },
    to: { type: "string" },
    rounding: { type: "string", short: "r" },
    json: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
};

/**
 * Parse CLI arguments into command, positionals, and option values.
 * @param {string[]} argv
 * @returns {{command: string|undefined, positionals: string[], values: object}}
 */
export function parseArgs(argv) {
    const { values, positionals } = nodeParseArgs({
        args: argv,
        options: OPTIONS,
        allowPositionals: true,
    });
    return { command: positionals[0], positionals, values };
}

/**
 * Resolve a --format style argument into either a preset key (string) or a
 * parsed custom format object (when a JSON object string is supplied).
 * @param {string} spec
 * @returns {string|object}
 */
function parseFormatSpec(spec) {
    const trimmed = spec.trim();
    if (trimmed.startsWith("{")) {
        try {
            return JSON.parse(trimmed);
        } catch {
            throw new Error(`Invalid custom format JSON: ${spec}`);
        }
    }
    return spec;
}

/**
 * Require a positional argument at the given index, or throw.
 * @param {string[]} positionals
 * @param {number} index
 * @param {string} name
 * @returns {string}
 */
function requirePositional(positionals, index, name) {
    const value = positionals[index];
    if (value === undefined) {
        throw new Error(`Missing required argument: <${name}>`);
    }
    return value;
}

/**
 * Require an option to be present, or throw.
 * @param {string|undefined} value
 * @param {string} flag
 * @returns {string}
 */
function requireOption(value, flag) {
    if (value === undefined) {
        throw new Error(`Missing required option: ${flag}`);
    }
    return value;
}

/**
 * Print a result either as JSON or via the supplied text renderer.
 * @param {object} data
 * @param {boolean} json
 * @param {() => string} renderText
 */
function output(data, json, renderText) {
    const text = json ? JSON.stringify(data, null, 2) : renderText();
    process.stdout.write(`${text}\n`);
}

/**
 * Dispatch a parsed command. Throws on user errors (handled by main).
 * @param {{command: string|undefined, positionals: string[], values: object}} parsed
 */
function dispatch({ command, positionals, values }) {
    switch (command) {
        case "encode": {
            const value = requirePositional(positionals, 1, "value");
            const format = parseFormatSpec(requireOption(values.format, "--format"));
            const data = runEncode({ value, format, roundingMode: values.rounding });
            output(data, values.json, () => renderStats(data));
            break;
        }
        case "decode": {
            const bits = requirePositional(positionals, 1, "bits");
            const format = parseFormatSpec(requireOption(values.format, "--format"));
            const data = runDecode({ bits, format });
            output(data, values.json, () => renderStats(data));
            break;
        }
        case "convert": {
            const value = requirePositional(positionals, 1, "value");
            const from = parseFormatSpec(requireOption(values.from, "--from"));
            const to = parseFormatSpec(requireOption(values.to, "--to"));
            const data = runConvert({ value, from, to, roundingMode: values.rounding });
            output(data, values.json, () =>
                renderConvert(data, {
                    from: typeof from === "string" ? from : "custom",
                    to: typeof to === "string" ? to : "custom",
                })
            );
            break;
        }
        case "info": {
            const formatArg = requirePositional(positionals, 1, "format");
            const format = parseFormatSpec(formatArg);
            const data = runInfo({ format });
            output(data, values.json, () =>
                renderInfo(data, {
                    format: typeof format === "string" ? format : "custom",
                })
            );
            break;
        }
        case "list": {
            const data = runList();
            output(data, values.json, () => renderList(data));
            break;
        }
        default:
            throw new Error(`Unknown command: ${command}`);
    }
}

/**
 * CLI entry point. Reads process.argv, dispatches the command, and maps user
 * errors to a non-zero exit code with a message on stderr.
 */
export async function main() {
    let parsed;
    try {
        parsed = parseArgs(process.argv.slice(2));
    } catch (err) {
        fail(err);
        return;
    }

    const { command, values } = parsed;

    if (values.version) {
        process.stdout.write(`${CLI_VERSION}\n`);
        return;
    }

    if (values.help || command === undefined) {
        process.stdout.write(`${HELP}\n`);
        return;
    }

    try {
        dispatch(parsed);
    } catch (err) {
        fail(err);
    }
}

/**
 * Write an error message to stderr and exit with code 1.
 * @param {unknown} err
 */
function fail(err) {
    const message = err instanceof Error ? err.message : String(err);
    process.stderr.write(`${CLI_NAME}: ${message}\n`);
    process.exit(1);
}
