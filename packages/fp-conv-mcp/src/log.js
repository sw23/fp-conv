// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/**
 * Write a diagnostic line to stderr.
 *
 * The stdio transport reserves stdout exclusively for JSON-RPC frames, so all
 * logging MUST go to stderr to avoid corrupting the protocol stream.
 * @param {string} message
 */
export function log(message) {
    process.stderr.write(`[fp-conv-mcp] ${message}\n`);
}
