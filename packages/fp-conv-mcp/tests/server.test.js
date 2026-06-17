// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";

import { createServer } from "../src/server.js";
import { listToolDefinitions, callTool } from "../src/tools.js";

const EXPECTED_TOOLS = [
    "list_formats",
    "encode_number",
    "decode_bits",
    "convert_format",
    "get_format_info",
];

/** Parse the JSON payload embedded in an MCP tool result's first text block. */
function parseResult(result) {
    return JSON.parse(result.content[0].text);
}

describe("tool descriptors", () => {
    test("exposes exactly the expected tools with JSON Schema", () => {
        const defs = listToolDefinitions();
        expect(defs.map((d) => d.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
        for (const def of defs) {
            expect(typeof def.description).toBe("string");
            expect(def.inputSchema.type).toBe("object");
        }
    });
});

describe("callTool", () => {
    test("encode_number encodes 1.5 as fp16", () => {
        const stats = parseResult(callTool("encode_number", { value: 1.5, format: "fp16" }));
        expect(stats.binary).toBe("0011111000000000");
        expect(stats.hex).toBe("0x3E00");
        expect(stats.actualValue).toBe(1.5);
    });

    test("decode_bits decodes a hex fp16 pattern", () => {
        const stats = parseResult(callTool("decode_bits", { bits: "0x3E00", format: "fp16" }));
        expect(stats.actualValue).toBe(1.5);
    });

    test("convert_format reports precision loss between formats", () => {
        const out = parseResult(
            callTool("convert_format", {
                value: 3.14159,
                inputFormat: "fp32",
                outputFormat: "bf16",
            })
        );
        expect(out.input).toBeDefined();
        expect(out.output).toBeDefined();
        expect(out.precisionLoss).toBeDefined();
    });

    test("get_format_info returns range details", () => {
        const info = parseResult(callTool("get_format_info", { format: "fp32" }));
        expect(info.totalBits).toBe(32);
    });

    test("list_formats returns all presets", () => {
        const formats = parseResult(callTool("list_formats", {}));
        expect(Array.isArray(formats)).toBe(true);
        expect(formats.length).toBeGreaterThan(0);
    });

    test("unknown tool returns an error result", () => {
        const result = callTool("does_not_exist", {});
        expect(result.isError).toBe(true);
    });

    test("invalid format returns an error result instead of throwing", () => {
        const result = callTool("encode_number", { value: 1, format: "bogus" });
        expect(result.isError).toBe(true);
        expect(result.content[0].text).toMatch(/Unknown format/);
    });
});

describe("MCP server end-to-end", () => {
    /** @type {Client} */
    let client;

    beforeEach(async () => {
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
        const server = createServer();
        client = new Client({ name: "test-client", version: "1.0.0" });
        await Promise.all([
            server.connect(serverTransport),
            client.connect(clientTransport),
        ]);
    });

    afterEach(async () => {
        await client.close();
    });

    test("lists tools over the protocol", async () => {
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOLS].sort());
    });

    test("calls a tool over the protocol", async () => {
        const result = await client.callTool({
            name: "encode_number",
            arguments: { value: 1.5, format: "fp16" },
        });
        const stats = JSON.parse(result.content[0].text);
        expect(stats.actualValue).toBe(1.5);
    });

    test("propagates tool errors as isError results", async () => {
        const result = await client.callTool({
            name: "encode_number",
            arguments: { value: 1, format: "bogus" },
        });
        expect(result.isError).toBe(true);
    });
});
