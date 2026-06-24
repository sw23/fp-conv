# Publishing to npm

This repository publishes two independently versioned npm packages from the
`packages/` workspace:

| Package | Command / entry | Workflow |
| --- | --- | --- |
| [`fp-conv-cli`](https://www.npmjs.com/package/fp-conv-cli) | `fp-conv` CLI | [`.github/workflows/publish-cli.yml`](../.github/workflows/publish-cli.yml) |
| [`fp-conv-mcp`](https://www.npmjs.com/package/fp-conv-mcp) | MCP server | [`.github/workflows/publish-mcp.yml`](../.github/workflows/publish-mcp.yml) |

Both packages are published automatically when a **GitHub Release** is published.
Authentication uses npm [trusted publishing](https://docs.npmjs.com/trusted-publishers)
(OIDC), so no `NPM_TOKEN` secret is stored in the repository.

Each workflow is keyed to its own release tag prefix, so a release only triggers
the matching package's pipeline:

| Tag prefix | Triggers |
| --- | --- |
| `cli-v*` (e.g. `cli-v1.0.1`) | `publish-cli.yml` |
| `mcp-v*` (e.g. `mcp-v1.0.2`) | `publish-mcp.yml` |

## One-time setup (per package)

Do this once for each package name before the first automated publish.

1. **Create the package on npm.** If the name does not exist yet, do an initial
   manual publish (see [Manual publish](#manual-publish-fallback)), or reserve the
   name. Trusted publishing can only be configured on a package that exists.
2. **Configure trusted publishing on npmjs.com:**
   - Sign in to [npmjs.com](https://www.npmjs.com/) as a maintainer.
   - Open the package page → **Settings** → **Trusted Publishing**.
   - Add a **GitHub Actions** publisher with:
     - Repository owner: `sw23`
     - Repository name: `fp-conv`
     - Workflow filename: `publish-cli.yml` (or `publish-mcp.yml`)
   - Save.
3. Ensure the package is configured for **public** access (the workflows publish
   with `--access public`).

## Release checklist

1. **Bump the version** of the package you intend to publish. Edit its
   `package.json` `version` field (follow [semver](https://semver.org/)):

   ```bash
   # from the repo root
   npm version patch --workspace fp-conv-cli --no-git-tag-version
   ```

   Only bump the package(s) you are releasing. The publish workflow runs
   `npm publish` directly, so a release whose version is not bumped fails at the
   publish step (npm rejects republishing an existing version).

2. **Verify the build and tests locally:**

   ```bash
   npm ci
   npm run build --workspace fp-conv-cli
   npm test --workspace fp-conv-cli
   npm run test:coverage   # shared engine coverage
   npm run lint
   ```

3. **Optional: dry-run the publish** to inspect the tarball contents (only the
   files in the package `files` field should be included):

   ```bash
   npm publish --workspace fp-conv-cli --dry-run
   ```

4. **Commit and push** the version bump (open a PR and merge to `main`):

   ```bash
   git add packages/fp-conv-cli/package.json package-lock.json
   git commit -m "Release fp-conv-cli vX.Y.Z"
   git push
   ```

5. **Create a GitHub Release:**
   - Go to the repository → **Releases** → **Draft a new release**.
   - Create a tag with the package's prefix: `cli-vX.Y.Z` for the CLI or
     `mcp-vX.Y.Z` for the MCP server. The prefix is what selects which workflow
     runs.
   - Set the title and notes, then **Publish release**.

6. **Watch the workflow.** Publishing a `cli-v*` release triggers
   [`publish-cli.yml`](../.github/workflows/publish-cli.yml) (and only that
   workflow). Open the **Actions** tab and confirm the run succeeds.

7. **Verify on npm:**

   ```bash
   npm view fp-conv-cli version
   ```

## Manual `workflow_dispatch` publish

You can also trigger a publish without creating a release:

- Repository → **Actions** → **Publish fp-conv-cli** → **Run workflow**.

Make sure the version was bumped first. The workflow publishes unconditionally,
so running it against an already-published version fails at the publish step.

## Manual publish (fallback)

If you must publish from your machine (for example, the very first publish to
reserve the name), authenticate to npm and publish from the repo root:

```bash
npm login
npm ci
npm run build --workspace fp-conv-cli
npm publish --workspace fp-conv-cli --access public
```

> Note: a local publish does not produce npm provenance. Prefer the GitHub
> Actions workflow for normal releases.

## Troubleshooting

- **`You cannot publish over the previously published versions`** — the version
  was not bumped. Update `package.json` `version` and release again.
- **`npm error code E403` / authentication errors in CI** — trusted publishing is
  not configured for this package/workflow. Re-check the
  [one-time setup](#one-time-setup-per-package), including the exact workflow
  filename.
- **Wrong files in the tarball** — adjust the `files` field in the package
  `package.json` and re-run `npm publish --dry-run`.
