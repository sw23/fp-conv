// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { createServer as createHttpServer } from "node:http";
import { randomUUID } from "node:crypto";

import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

import { createServer } from "./server.js";
import { log } from "./log.js";

const MCP_PATH = "/mcp";

// The largest request body read into memory. A tool call is a few hundred
// bytes; the longest legitimate argument, a decimal string at the library's
// 100,000-digit cap, still fits ten times over.
export const MAX_BODY_BYTES = 1024 * 1024;

// A session with no request in flight for this long is closed. Clients that
// never send DELETE would otherwise keep a server and transport alive for the
// life of the process.
export const SESSION_IDLE_MS = 30 * 60 * 1000;
const SESSION_SWEEP_MS = 60 * 1000;

// Host names that always reach a loopback bind.
const LOOPBACK_HOSTNAMES = new Set(["localhost", "127.0.0.1", "[::1]"]);

// Bind addresses that accept connections on every interface. The names such a
// server is reached by are not knowable here, so the Host check is skipped.
const WILDCARD_HOSTS = new Set(["0.0.0.0", "::", "[::]", ""]);

class BodyTooLargeError extends Error {}

/**
 * Read and JSON-parse the request body, refusing one past `limit` bytes. The
 * rest of an oversized body is drained rather than buffered, so the 413 can
 * still be delivered on the same connection.
 * @param {import('node:http').IncomingMessage} req
 * @param {number} [limit]
 * @returns {Promise<unknown>}
 */
function readJsonBody(req, limit = MAX_BODY_BYTES) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        let size = 0;
        req.on("data", (chunk) => {
            size += chunk.length;
            if (size <= limit) chunks.push(chunk);
        });
        req.on("end", () => {
            if (size > limit) {
                reject(new BodyTooLargeError());
                return;
            }
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

function writeJsonError(res, statusCode, message, { code = -32000, id = null } = {}) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(
        JSON.stringify({
            jsonrpc: "2.0",
            error: { code, message },
            id,
        })
    );
}

/**
 * The lower-cased host name in a Host header value or an origin, with an IPv6
 * literal kept in brackets, or null when it does not parse.
 * @param {string | undefined} value - "host[:port]", or "scheme://host[:port]".
 */
function hostnameOf(value) {
    if (!value) return null;
    try {
        return new URL(value.includes("://") ? value : `http://${value}`).hostname || null;
    } catch {
        return null;
    }
}

/**
 * The host names a request to this bind address may carry, or null for a
 * wildcard bind, where any name may be legitimate.
 * @param {string} host
 */
function allowedHostnames(host) {
    if (WILDCARD_HOSTS.has(host)) return null;
    const allowed = new Set(LOOPBACK_HOSTNAMES);
    const bound = hostnameOf(host.includes(":") && !host.startsWith("[") ? `[${host}]` : host);
    if (bound) allowed.add(bound);
    return allowed;
}

/**
 * Why a request must be refused before it reaches the transport, as
 * [status, message], or null when it may proceed.
 *
 * This is the DNS-rebinding defense the MCP transport spec asks for: a page on
 * evil.example that rebinds its name to 127.0.0.1 sends `Host: evil.example`,
 * and a cross-site request carries the page's Origin. Origins are compared by
 * host name only, so a browser client served from another local port (the MCP
 * Inspector) still works.
 * @param {import('node:http').IncomingMessage} req
 * @param {Set<string> | null} allowed
 * @returns {[number, string] | null}
 */
function rejectReason(req, allowed) {
    const requestHost = hostnameOf(req.headers.host);
    if (requestHost === null) {
        return [400, "Bad Request: missing or invalid Host header."];
    }
    if (allowed !== null && !allowed.has(requestHost)) {
        return [403, `Forbidden: Host "${requestHost}" is not allowed.`];
    }
    const origin = req.headers.origin;
    if (origin !== undefined) {
        const originHost = hostnameOf(origin);
        const ok = originHost !== null && (allowed !== null
            ? allowed.has(originHost)
            : LOOPBACK_HOSTNAMES.has(originHost) || originHost === requestHost);
        if (!ok) return [403, "Forbidden: Origin is not allowed."];
    }
    return null;
}

/**
 * Start a localhost-only Streamable HTTP MCP server.
 *
 * Each MCP session gets its own server + transport, tracked by session id.
 * This is intended purely as a local alternative to stdio; do not bind it to a
 * non-loopback interface without adding authentication.
 *
 * Rejects (rather than emitting an unhandled 'error') when the address cannot
 * be bound, e.g. EADDRINUSE.
 *
 * @param {{host?: string, port?: number, sessionIdleMs?: number, sessionSweepMs?: number}} [options]
 *   The two session timings exist for tests.
 * @returns {Promise<import('node:http').Server>}
 */
export function startHttpServer({
    host = "127.0.0.1",
    port = 3001,
    sessionIdleMs = SESSION_IDLE_MS,
    sessionSweepMs = SESSION_SWEEP_MS,
} = {}) {
    /** @type {Map<string, StreamableHTTPServerTransport>} */
    const transports = new Map();
    // Per session: requests still open (a GET stream may stay open for a long
    // time without being idle) and when the last one finished.
    /** @type {Map<string, {inFlight: number, lastSeen: number}>} */
    const activity = new Map();
    const allowed = allowedHostnames(host);

    function track(sessionId, res) {
        const entry = activity.get(sessionId) ?? { inFlight: 0, lastSeen: Date.now() };
        activity.set(sessionId, entry);
        entry.inFlight++;
        res.on("close", () => {
            entry.inFlight--;
            entry.lastSeen = Date.now();
        });
    }

    const sweep = setInterval(() => {
        const now = Date.now();
        for (const [id, entry] of activity) {
            if (entry.inFlight === 0 && now - entry.lastSeen >= sessionIdleMs) {
                activity.delete(id);
                const transport = transports.get(id);
                transports.delete(id);
                if (transport) {
                    log(`Closing idle session ${id}`);
                    transport.close().catch(() => {});
                }
            }
        }
    }, sessionSweepMs);
    sweep.unref();

    const httpServer = createHttpServer(async (req, res) => {
        try {
            const rejection = rejectReason(req, allowed);
            if (rejection) {
                writeJsonError(res, rejection[0], rejection[1]);
                return;
            }

            // The path only: the Host header has been checked, but it is not
            // needed to read the path and must not be able to throw here.
            const url = new URL(req.url ?? "/", "http://localhost");
            if (url.pathname !== MCP_PATH) {
                writeJsonError(res, 404, `Not found. Use ${MCP_PATH}.`);
                return;
            }

            const sessionId = /** @type {string | undefined} */ (
                req.headers["mcp-session-id"]
            );

            if (req.method === "POST") {
                let body;
                try {
                    body = await readJsonBody(req);
                } catch (err) {
                    if (err instanceof BodyTooLargeError) {
                        writeJsonError(res, 413,
                            `Payload too large: the limit is ${MAX_BODY_BYTES} bytes.`);
                        return;
                    }
                    // Malformed JSON is a JSON-RPC parse error, not a server fault.
                    writeJsonError(res, 400, "Parse error: request body is not valid JSON.", {
                        code: -32700,
                    });
                    return;
                }
                let transport = sessionId ? transports.get(sessionId) : undefined;

                if (!transport && isInitializeRequest(body)) {
                    transport = new StreamableHTTPServerTransport({
                        sessionIdGenerator: () => randomUUID(),
                        onsessioninitialized: (id) => {
                            transports.set(id, transport);
                            activity.set(id, { inFlight: 0, lastSeen: Date.now() });
                        },
                    });
                    transport.onclose = () => {
                        if (transport.sessionId) {
                            transports.delete(transport.sessionId);
                            activity.delete(transport.sessionId);
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

                if (sessionId) track(sessionId, res);
                await transport.handleRequest(req, res, body);
                return;
            }

            if (req.method === "GET" || req.method === "DELETE") {
                const transport = sessionId ? transports.get(sessionId) : undefined;
                if (!transport) {
                    writeJsonError(res, 400, "Bad Request: unknown or missing session id.");
                    return;
                }
                track(sessionId, res);
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

    httpServer.on("close", () => clearInterval(sweep));

    return new Promise((resolve, reject) => {
        const onError = (err) => {
            clearInterval(sweep);
            reject(err);
        };
        httpServer.once("error", onError);
        httpServer.listen(port, host, () => {
            httpServer.off("error", onError);
            // A later server error is logged, not left to crash the process.
            httpServer.on("error", (err) => log(`HTTP server error: ${err.message}`));
            const addr = httpServer.address();
            const boundPort = addr && typeof addr === "object" ? addr.port : port;
            log(`fp-conv-mcp Streamable HTTP server listening on http://${host}:${boundPort}${MCP_PATH}`);
            resolve(httpServer);
        });
    });
}
