// Copyright (c) 2026 Spencer Williams
// Licensed under the MIT License.

// Dedicated CLI entry point. This file's only job is to invoke main(); it is
// the esbuild bundle entry (built to dist/index.js) and the package "bin".
// Keeping it separate from index.js means importing the library (e.g. in unit
// tests) never auto-runs the server, with no main-module heuristic required.

import { main } from "./index.js";

main().catch((err) => {
    const message = err instanceof Error ? err.stack || err.message : String(err);
    process.stderr.write(`[fp-conv-mcp] Fatal: ${message}\n`);
    process.exit(1);
});
