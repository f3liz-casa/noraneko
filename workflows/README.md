# Workflows (authored with gaji)

The files under `.github/workflows/` and `.github/actions/` are **generated**.
Don't edit the YAML by hand — edit the TypeScript here and rebuild.

We use [gaji](https://github.com/dodok8/gaji) to author GitHub Actions in
TypeScript and compile them to YAML. The generated `generated/` types and the
compiled `.github` YAML are committed on purpose, so a fresh checkout builds
without any network access or token.

## Layout

| Source (`workflows/`)              | Output                                              |
| ---------------------------------- | --------------------------------------------------- |
| `copilot-setup-steps.ts`           | `.github/workflows/copilot-setup-steps.yml`         |
| `package.ts`                       | `.github/workflows/package.yml`                     |
| `publish_alpha.ts`                 | `.github/workflows/publish_alpha.yml`               |
| `package_and_publish_alpha.ts`     | `.github/workflows/package_and_publish_alpha.yml`   |
| `action-setup-noraneko.ts`         | `.github/actions/setup-noraneko/action.yml`         |

## Install gaji

gaji is a small Rust CLI, distributed independently of this Deno project:

```sh
cargo install gaji      # or: npm install -g gaji
```

## Everyday flow

```sh
# Edit a workflow in workflows/*.ts, then:
deno task gha:build     # compile TypeScript -> .github YAML

# When you add a new action via getAction("owner/repo@ver"),
# fetch its types first (needs network, optionally GITHUB_TOKEN):
deno task gha:dev
```

Commit **both** the `.ts` source and the regenerated YAML. Review the YAML diff
before pushing — the YAML is what GitHub actually runs.

## Notes

- These files are excluded from the repo's `deno check` (they target gaji's
  runtime, not Deno). gaji validates the generated YAML on build.
- `run-name` isn't expressible through gaji's builder, so the workflows that
  need it splice it into the definition and re-emit via `Workflow.fromObject`.
- gaji emits `workflow_dispatch: {}` where the old YAML wrote a bare
  `workflow_dispatch:`; these are equivalent to GitHub.
