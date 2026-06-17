// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

// Reuse the exact same tool descriptors that power the experimental in-browser
// WebMCP integration. The root `src/webmcp.js` module is CommonJS and already
// imports the conversion engine from `lib/floating-point.js`; esbuild inlines
// both into the published bundle so there is a single source of truth.
import webmcp from "../../../src/webmcp.js";

const { buildToolDescriptors } = webmcp;

/**
 * Tool descriptors shared with the browser WebMCP build.
 * Each descriptor is `{ name, description, inputSchema, execute(params) }`,
 * where `inputSchema` is plain JSON Schema and `execute` returns a JSON-ready
 * object.
 * @type {Array<{name: string, description: string, inputSchema: object, execute: (params: object) => unknown}>}
 */
export const toolDescriptors = buildToolDescriptors();

/**
 * Map descriptors to the MCP `tools/list` shape.
 * @returns {Array<{name: string, description: string, inputSchema: object}>}
 */
export function listToolDefinitions() {
    return toolDescriptors.map(({ name, description, inputSchema }) => ({
        name,
        description,
        inputSchema,
    }));
}

/**
 * Execute a tool by name and return an MCP tool result.
 *
 * The shared `execute` implementations already return MCP-style
 * `{ content: [...] }` results and throw on invalid input, so successful
 * results are passed through unchanged. Thrown errors are converted into
 * `isError` results so the client receives a useful message instead of a
 * transport-level failure.
 * @param {string} name - Tool name.
 * @param {object} args - Tool arguments.
 * @returns {{content: Array<{type: string, text: string}>, isError?: boolean}}
 */
export function callTool(name, args) {
    const tool = toolDescriptors.find((t) => t.name === name);
    if (!tool) {
        return {
            isError: true,
            content: [{ type: "text", text: `Unknown tool: "${name}"` }],
        };
    }

    try {
        return tool.execute(args ?? {});
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
            isError: true,
            content: [{ type: "text", text: `Error: ${message}` }],
        };
    }
}
