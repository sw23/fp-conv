// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import { startHttpServer } from "../src/http.js";

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

    test("returns a JSON error for a malformed initialize body", async () => {
        const res = await rawFetch(server, "/mcp", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: "{ not valid json",
        });
        expect(res.status).toBe(500);
        const body = await res.json();
        expect(body.error.message).toMatch(/Internal server error/);
    });
});
