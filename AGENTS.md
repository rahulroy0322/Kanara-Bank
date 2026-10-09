# AGENTS.md

## Project

Kanara Bank — digital-only fintech bank backend (Phase 1).
Express + TypeScript + Drizzle ORM + MySQL. Validation with Joi. Argon2 password hashing. JWT auth (access + refresh). OTP stored in a local memory map (5 min TTL).

All money amounts are stored and served as **Paisa (integer)**. No decimals; the client converts to Rupees.

## Commands

- `npm run dev` — watch mode (tsx)
- `npm run build` — `tsc` to `dist/`
- `npm start` — run built output
- `npm run db:make` — drizzle-kit generate
- `npm run db:apply` — drizzle-kit migrate
- `npm run lint` — eslint over `src/`
- `npm run format` — biome format check
- `npm run format:fix` — biome format write
- `npm test` — vitest

## Architecture

Strict layered flow for every API request:

`Routes (Joi validation middleware) -> Controller -> Service -> Repository -> DB`

- **Routes:** validate `req.body` / `req.query` via Joi middleware.
- **Controller:** HTTP transport only. No business logic, no DB access.
- **Service:** business logic only. No `req`/`res`, no DB access.
- **Repository:** Drizzle/MySQL access only.

## Response shapes

Success: `{ "success": true, "data": <payload | null>, "meta"?: { page, limit, total, totalPages } }`

Error: `{ "success": false, "error": { "code": "ERROR_CODE", "message": "human readable" } }`

## TypeScript conventions

- Use `type` instead of `interface`.
- Use arrow functions (`const fn = () => {}`) instead of `function fn() {}` declarations.
- Define first, export at the end. No inline `export` on declarations; all exports live in one place at the bottom of the file.
- If a file has both runtime and type exports, split them into two export statements at the end:
  - `export { ... }` for runtime values
  - `export type { ... }` for types
- Type names must end with `Type` suffix to distinguish from variables (e.g., `UserType`, `ApiResponseType`).

```ts
type User = {
  id: string
}

const getUser = async (id: string): Promise<User | null> => {
  return null
}

export { getUser }
export type { User }
```

## Rules

- Never run `npm install` or add dependencies yourself. If a dependency is required, tell the user what to install, wait for them to install it, then continue.

## Config

- Strict mode is on. Target ES2022, module NodeNext. No path aliases — use relative imports.
