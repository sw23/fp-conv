// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { createServer } from "./server.js";
import { log } from "./log.js";

const MCP_PATH = "/mcp";

/**
 * Read and JSON-parse the request body.
 * @param {import('node:http').IncomingMessage} req
 * @returns {Promise<unknown>}
 */
function readJsonBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            if (!raw) {
                resolve(undefined);
                return;
            }
            try {
                resolve(JSON.parse(raw));
            } catch (err) {
                reject(err);
            }
        });
        req.on("error", reject);
    });
}

function writeJsonError(res, statusCode, message, id = null) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(
        JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32000, message },
            id,
        })
    );
}

/**
 * Start a localhost-only Streamable HTTP MCP server.
 *
 * Each MCP session gets its own server + transport, tracked by session id.
 * This is intended purely as a local alternative to stdio; do not bind it to a
 * non-loopback interface without adding authentication.
 *
 * @param {{host?: string, port?: number}} [options]
 * @returns {Promise<import('node:http').Server>}
 */
export function startHttpServer({ host = "127.0.0.1", port = 3001 } = {}) {
    /** @type {Map<string, StreamableHTTPServerTransport>} */
    const transports = new Map();

    const httpServer = createHttpServer(async (req, res) => {
        const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
        if (url.pathname !== MCP_PATH) {
            writeJsonError(res, 404, `Not found. Use ${MCP_PATH}.`);
            return;
        }

        const sessionId = /** @type {string | undefined} */ (
            req.headers["mcp-session-id"]
        );

        try {
            if (req.method === "POST") {
                const body = await readJsonBody(req);
                let transport = sessionId ? transports.get(sessionId) : undefined;

                if (!transport && isInitializeRequest(body)) {
                    transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        onsessioninitialized: (id) => {
                            transports.set(id, transport);
                        },
                    });
                    transport.onclose = () => {
                        if (transport.sessionId) {
                            transports.delete(transport.sessionId);
                        }
                    };
                    await createServer().connect(transport);
                } else if (!transport) {
                    writeJsonError(
                        res,
                        400,
                        "Bad Request: no valid session id and not an initialize request."
                    );
                    return;
                }

                await transport.handleRequest(req, res, body);
                return;
            }

            if (req.method === "GET" || req.method === "DELETE") {
                const transport = sessionId ? transports.get(sessionId) : undefined;
                if (!transport) {
                    writeJsonError(res, 400, "Bad Request: unknown or missing session id.");
                    return;
                }
                await transport.handleRequest(req, res);
                return;
            }

            res.writeHead(405, { Allow: "GET, POST, DELETE" });
            res.end();
        } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            log(`HTTP request error: ${message}`);
            if (!res.headersSent) {
                writeJsonError(res, 500, "Internal server error.");
            }
        }
    });

    return new Promise((resolve) => {
        httpServer.listen(port, host, () => {
            log(`fp-conv-mcp Streamable HTTP server listening on http://${host}:${port}${MCP_PATH}`);
            resolve(httpServer);
        });
    });
}
