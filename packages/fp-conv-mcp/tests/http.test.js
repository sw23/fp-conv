// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { request as httpRequest } from "node:http";
import { connect as netConnect } from "node:net";

import { startHttpServer, MAX_BODY_BYTES } from "../src/http.js";
import { spyOn } from "./helpers.js";

const INITIALIZE = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "raw", version: "1.0.0" },
    },
});

/**
 * A request with full control of the headers (fetch will not send an
 * arbitrary Host). Resolves to { status, headers, body }.
 */
function rawRequest(server, { method = "POST", path = "/mcp", headers = {}, body } = {}) {
    const { port } = server.address();
    return new Promise((resolve, reject) => {
        const req = httpRequest(
            { host: "127.0.0.1", port, method, path, headers: { "Content-Type": "application/json", ...headers } },
            (res) => {
                const chunks = [];
                res.on("data", (c) => chunks.push(c));
                res.on("end", () =>
                    resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString("utf8") }));
            }
        );
        req.on("error", reject);
        if (body !== undefined) req.write(body);
        req.end();
    });
}

/** Initialize a session over raw HTTP and return its id. */
async function openSession(server) {
    const res = await rawRequest(server, {
        headers: { Accept: "application/json, text/event-stream" },
        body: INITIALIZE,
    });
    expect(res.status).toBe(200);
    return res.headers["mcp-session-id"];
}

/** Resolve the base http URL (including /mcp) for a listening server. */
function mcpUrl(server) {
    const addr = server.address();
    return new URL(`http://127.0.0.1:${addr.port}/mcp`);
}

/** Minimal fetch of an arbitrary path/method against the server. */
async function rawFetch(server, path, init) {
    const addr = server.address();
    return fetch(`http://127.0.0.1:${addr.port}${path}`, init);
}

describe("startHttpServer", () => {
    /** @type {import('node:http').Server} */
    let server;

    // The server logs a "listening" line to stderr on startup; suppress it so
    // it does not pollute the test runner output.
    let stderrSpy;
    beforeAll(() => {
        stderrSpy = spyOn(process.stderr, "write");
    });
    afterAll(() => {
        stderrSpy.restore();
    });

    beforeEach(async () => {
        // Port 0 lets the OS pick a free ephemeral port.
        server = await startHttpServer({ host: "127.0.0.1", port: 0 });
    });

    afterEach(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    test("binds to loopback and reports an address", () => {
        const addr = server.address();
        expect(addr.address).toBe("127.0.0.1");
        expect(addr.port).toBeGreaterThan(0);
    });

    test("serves a full MCP session over Streamable HTTP", async () => {
        const client = new Client({ name: "http-test-client", version: "1.0.0" });
        const transport = new StreamableHTTPClientTransport(mcpUrl(server));

        await client.connect(transport);
        try {
            const { tools } = await client.listTools();
            expect(tools.length).toBeGreaterThan(0);

            const result = await client.callTool({
                name: "encode_number",
                arguments: { value: 1.5, format: "fp16" },
            });
            const stats = JSON.parse(result.content[0].text);
            expect(stats.actualValue).toBe(1.5);
        } finally {
            await transport.close();
        }
    });

    test("returns 404 for a non-MCP path", async () => {
        const res = await rawFetch(server, "/", { method: "POST" });
        expect(res.status).toBe(404);
        const body = await res.json();
        expect(body.error.message).toMatch(/Use \/mcp/);
    });

    test("rejects a POST without a session id that is not an initialize request", async () => {
        const res = await rawFetch(server, "/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ jsonrpc: "2.0", method: "tools/list", id: 1 }),
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toMatch(/no valid session id/);
    });

    test("rejects a GET with an unknown session id", async () => {
        const res = await rawFetch(server, "/mcp", {
            method: "GET",
            headers: { "mcp-session-id": "does-not-exist" },
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.message).toMatch(/unknown or missing session id/);
    });

    test("rejects a DELETE with no session id", async () => {
        const res = await rawFetch(server, "/mcp", { method: "DELETE" });
        expect(res.status).toBe(400);
    });

    test("responds 405 to an unsupported method", async () => {
        const res = await rawFetch(server, "/mcp", { method: "PUT" });
        expect(res.status).toBe(405);
        expect(res.headers.get("allow")).toBe("GET, POST, DELETE");
    });

    test("returns a JSON-RPC parse error for a malformed initialize body", async () => {
        const res = await rawFetch(server, "/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{ not valid json",
        });
        expect(res.status).toBe(400);
        const body = await res.json();
        expect(body.error.code).toBe(-32700);
        expect(body.error.message).toMatch(/Parse error/);
    });

    test("survives a request with an empty Host header", async () => {
        // A malformed Host used to throw outside the handler's try and take the
        // whole process down with an unhandled rejection.
        const { port } = server.address();
        const reply = await new Promise((resolve, reject) => {
            const socket = netConnect(port, "127.0.0.1", () => {
                socket.write("GET /mcp HTTP/1.1\r\nHost: \r\nConnection: close\r\n\r\n");
            });
            let data = "";
            socket.on("data", (c) => (data += c));
            socket.on("end", () => resolve(data));
            socket.on("error", reject);
        });
        expect(reply).toMatch(/^HTTP\/1\.1 400/);

        // And it is still serving.
        const res = await rawFetch(server, "/", { method: "POST" });
        expect(res.status).toBe(404);
    });

    test("refuses a Host that is not a loopback name (DNS rebinding)", async () => {
        const res = await rawRequest(server, {
            headers: { Host: `evil.example.com:${server.address().port}`, Accept: "application/json, text/event-stream" },
            body: INITIALIZE,
        });
        expect(res.status).toBe(403);
        expect(JSON.parse(res.body).error.message).toMatch(/Host "evil.example.com" is not allowed/);
    });

    test("refuses a cross-site Origin but accepts a loopback one on any port", async () => {
        const evil = await rawRequest(server, {
            headers: { Origin: "http://evil.example.com", Accept: "application/json, text/event-stream" },
            body: INITIALIZE,
        });
        expect(evil.status).toBe(403);
        expect(JSON.parse(evil.body).error.message).toMatch(/Origin is not allowed/);

        // A browser client served from another local port, like the MCP Inspector.
        const local = await rawRequest(server, {
            headers: {
                Host: `localhost:${server.address().port}`,
                Origin: "http://localhost:6274",
                Accept: "application/json, text/event-stream",
            },
            body: INITIALIZE,
        });
        expect(local.status).toBe(200);
    });

    test("refuses a body past the size limit with 413", async () => {
        const res = await rawRequest(server, { body: "x".repeat(MAX_BODY_BYTES + 1) });
        expect(res.status).toBe(413);
        expect(JSON.parse(res.body).error.message).toMatch(/Payload too large/);
    });

    test("rejects instead of crashing when the port is taken", async () => {
        await expect(startHttpServer({ host: "127.0.0.1", port: server.address().port }))
            .rejects.toMatchObject({ code: "EADDRINUSE" });
    });
});

describe("idle sessions", () => {
    let stderrSpy;
    let server;
    beforeAll(() => {
        stderrSpy = spyOn(process.stderr, "write");
    });
    afterAll(() => {
        stderrSpy.restore();
    });
    afterEach(async () => {
        await new Promise((resolve) => server.close(resolve));
    });

    test("a session with nothing in flight is closed after the idle timeout", async () => {
        server = await startHttpServer({ host: "127.0.0.1", port: 0, sessionIdleMs: 50, sessionSweepMs: 10 });
        const id = await openSession(server);
        expect(id).toBeTruthy();

        await new Promise((resolve) => setTimeout(resolve, 200));
        const res = await rawRequest(server, { method: "GET", headers: { "mcp-session-id": id, Accept: "text/event-stream" } });
        expect(res.status).toBe(400);
        expect(JSON.parse(res.body).error.message).toMatch(/unknown or missing session id/);
    });

    test("a session in use is kept", async () => {
        server = await startHttpServer({ host: "127.0.0.1", port: 0, sessionIdleMs: 60000, sessionSweepMs: 10 });
        const id = await openSession(server);
        await new Promise((resolve) => setTimeout(resolve, 50));
        const res = await rawRequest(server, {
            headers: { "mcp-session-id": id, "mcp-protocol-version": "2025-03-26", Accept: "application/json, text/event-stream" },
            body: JSON.stringify({ jsonrpc: "2.0", id: 2, method: "tools/list" }),
        });
        expect(res.status).toBe(200);
    });
});
