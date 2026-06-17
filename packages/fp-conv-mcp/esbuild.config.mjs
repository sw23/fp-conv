// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { build } from "esbuild";

// Read the package version so it can be baked into the bundle at build time,
// keeping package.json as the single source of truth for the version.
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "package.json"), "utf8"));

// Bundle our own source plus the shared root modules (lib/floating-point.js and
// src/webmcp.js), which live outside this package and would not otherwise be
// included when publishing to npm. Third-party dependencies such as the MCP SDK
// stay external and are resolved from node_modules at runtime.
await build({
    entryPoints: ["src/cli.js"],
    outfile: "dist/index.js",
    bundle: true,
    platform: "node",
    format: "esm",
    target: "node18",
    packages: "external",
    define: {
        __SERVER_VERSION__: JSON.stringify(pkg.version),
    },
    banner: {
        js: "#!/usr/bin/env node",
    },
    logLevel: "info",
});
