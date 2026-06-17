// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { createServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { startHttpServer } from "./http.js";
import { log } from "./log.js";

const HELP = `${SERVER_NAME} v${SERVER_VERSION}

Model Context Protocol server for floating-point conversions.

Usage:
  fp-conv-mcp [options]

Options:
  --http              Run a localhost Streamable HTTP server instead of stdio.
  --host <host>       HTTP host to bind (default: 127.0.0.1). HTTP mode only.
  --port <port>       HTTP port to bind (default: 3001). HTTP mode only.
  -h, --help          Show this help.
  -v, --version       Show version.

By default the server communicates over stdio, which is how most IDEs and
agents launch it. The --http transport binds to loopback only and is intended
as a local convenience; do not expose it to other interfaces without adding
authentication.`;

/**
 * Parse CLI arguments.
 * @param {string[]} argv
 * @returns {{help: boolean, version: boolean, http: boolean, host: string, port: number}}
 */
export function parseArgs(argv) {
    const opts = {
        help: false,
        version: false,
        http: false,
        host: "127.0.0.1",
        port: 3001,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        switch (arg) {
            case "-h":
            case "--help":
                opts.help = true;
                break;
            case "-v":
            case "--version":
                opts.version = true;
                break;
            case "--http":
                opts.http = true;
                break;
            case "--host":
                opts.host = argv[++i];
                break;
            case "--port": {
                const value = Number(argv[++i]);
                if (!Number.isInteger(value) || value < 1 || value > 65535) {
                    throw new Error(`Invalid --port value: ${argv[i]}`);
                }
                opts.port = value;
                break;
            }
            default:
                throw new Error(`Unknown argument: ${arg}`);
        }
    }

    return opts;
}

export async function main() {
    let opts;
    try {
        opts = parseArgs(process.argv.slice(2));
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        process.stderr.write(`${message}\n\n${HELP}\n`);
        process.exit(1);
    }

    if (opts.help) {
        process.stderr.write(`${HELP}\n`);
        return;
    }
    if (opts.version) {
        process.stderr.write(`${SERVER_VERSION}\n`);
        return;
    }

    if (opts.http) {
        await startHttpServer({ host: opts.host, port: opts.port });
        return;
    }

    const transport = new StdioServerTransport();
    await createServer().connect(transport);
    log("fp-conv-mcp server running on stdio");
}
