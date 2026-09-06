# Repository Guidelines

## Project Structure & Module Organization

This campus atlas uses React, TypeScript, Vinext/Vite, and Cloudflare tooling.

- `app/`: route entry points, global styles, atlas UI, and university types/data.
- `components/ui/`: reusable UI primitives; `hooks/` and `lib/`: shared hooks and utilities.
- `data/`: university records, campus candidates, and downloaded source evidence.
- `public/`: browser-served assets, including geographic data and generated models.
- `scripts/`: Python data preparation/download scripts and JavaScript campus generation.

Keep source evidence in `data/sources/` distinct from derived application assets.

## Build, Test, and Development Commands

Use Node.js **22.13.0 or newer** and npm.

- `npm ci`: install dependencies from the committed lockfile.
- `npm run dev`: start the Vinext development server.
- `npm run build`: produce the production build.
- `npm start`: preview the built worker through Wrangler; build first.
- `npm run lint`: run Oxlint with type-aware checks.
- `npm run format`: format the repository with Oxfmt. For focused edits, use `npx oxfmt <file>`.

Inspect data scripts before running them: they can download external data and overwrite generated files. `scripts/prepare-data.py` also expects input files under `/tmp/`.

## Coding Style & Naming Conventions

Use strict TypeScript, explicit domain types, ES modules, and `@/` imports for shared modules. Avoid `any`. Follow the existing two-space indentation, semicolons, single quotes, and Oxfmt's 80-column target. Use PascalCase component names, camelCase functions/variables, and lowercase kebab-case filenames such as `use-mobile.ts`. Reuse existing UI primitives and Tailwind utilities.

## Testing Guidelines

Playwright is available, but no test suite, runner configuration, `npm test` script, or coverage threshold is currently defined. Validate code changes with lint and build, then smoke-test affected flows in the browser. Record commands, outcomes, and limitations. When adding browser tests, use `tests/*.spec.ts`, configure Playwright's application URL/server, and run `npx playwright test`.

## Commit & Pull Request Guidelines

History currently contains `chore: initial commit`. Continue the `type: concise description` pattern, for example `feat: add campus filtering`. Keep commits focused. PRs should explain behavior changes, link relevant issues, report validation, and include screenshots for visual changes.

## Data & Configuration

Preserve source URLs, licenses, timestamps, and verification flags. Do not mark candidate geometry or estimated heights as verified without evidence. Keep secrets in ignored `.env*` files; exclude dependencies and build caches. `.openai/hosting.json` is imported by Vite, so retain required configuration without adding credentials.

## Task Completion & Automatic Delivery

- 任务完成并通过相应检查后，自动提交本次任务的代码变更、推送至 GitHub 远端，并通过 Sites 插件发布新版；这是持续授权，无需例行重复确认，除非用户明确要求仅本地修改或暂停发布。
- 仅提交本次任务负责的变更，不混入其他任务尚未完成的修改。由站点负责者执行发布，复用 `.openai/hosting.json` 中的现有站点，保持当前访问权限。
- 发布前确保构建成功，发布内容必须与已验证、已提交的源码一致；核对远端提交和 Sites 部署成功状态后，报告提交标识与新版链接。
- 检查、推送或发布失败时，说明具体阻塞和已完成的步骤，不得将未成功部署的版本报告为已发布。
