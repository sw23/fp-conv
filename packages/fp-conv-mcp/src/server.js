// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

/* global __SERVER_VERSION__ */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import { listToolDefinitions, callTool } from "./tools.js";

// Single source of truth for the version: package.json. esbuild's `define`
// replaces the __SERVER_VERSION__ token with the package.json version string at
// build time (see esbuild.config.mjs), so the bundled server has the real
// version baked in with no runtime lookup. When the source is run unbundled
// (unit tests), the token is undefined and we fall back to "0.0.0" — tests do
// not depend on the version being accurate.
export const SERVER_NAME = "fp-conv-mcp";
export const SERVER_VERSION =
    typeof __SERVER_VERSION__ === "string" ? __SERVER_VERSION__ : "0.0.0";

/**
 * Create a configured low-level MCP server exposing the floating-point
 * conversion tools. A fresh instance is returned on each call so it can be
 * paired with a single transport (required for stateful HTTP sessions).
 * @returns {Server}
 */
export function createServer() {
    const server = new Server(
        { name: SERVER_NAME, version: SERVER_VERSION },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({
        tools: listToolDefinitions(),
    }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const { name, arguments: args } = request.params;
        return callTool(name, args);
    });

    return server;
}
