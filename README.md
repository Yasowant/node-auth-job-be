# node-auth-job-be

JWT authentication and job-board REST API built with **Express 5** and **MongoDB**.

Access and refresh tokens are issued as `httpOnly` cookies, passwords are hashed with bcrypt, and routes are guarded by a role middleware supporting `USER`, `RECRUITER` and `ADMIN`.

[![CI](https://github.com/Yasowant/node-auth-job-be/actions/workflows/ci.yml/badge.svg)](https://github.com/Yasowant/node-auth-job-be/actions/workflows/ci.yml)
[![CD](https://github.com/Yasowant/node-auth-job-be/actions/workflows/cd.yml/badge.svg)](https://github.com/Yasowant/node-auth-job-be/actions/workflows/cd.yml)

---

## Contents

- [Stack](#stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [API reference](#api-reference)
- [Authentication model](#authentication-model)
- [Testing](#testing)
- [Docker](#docker)
- [CI/CD](#cicd)
- [Deployment](#deployment)
- [Known issues](#known-issues)

---

## Stack

| Concern        | Choice                          |
| -------------- | ------------------------------- |
| Runtime        | Node.js 20+ (CI tests 20 and 22) |
| Framework      | Express 5                       |
| Database       | MongoDB via Mongoose 9          |
| Auth           | JSON Web Tokens in httpOnly cookies |
| Password hash  | bcryptjs, cost factor 12        |
| Tests          | Jest + Supertest                |
| Lint           | ESLint 9 (flat config)          |
| Container      | Docker, `node:22-alpine`        |
| CI/CD          | GitHub Actions                  |

---

## Project structure

```
.
├── server.js                 # Process entry: DB connect, listen, graceful shutdown
├── Dockerfile                # Multi-stage production image
├── src
│   ├── app.js                # Express app: middleware, routes, error handling
│   ├── config/db.js          # Mongoose connection with fail-fast timeouts
│   ├── controllers           # Request handlers
│   ├── middleware
│   │   ├── authMiddleware.js # Verifies the access-token cookie
│   │   ├── roleMiddleware.js # authorizeRoles("ADMIN", ...)
│   │   └── errorMiddleware.js# notFound + centralised error translator
│   ├── models                # User, Company, Jobs schemas
│   ├── routes                # Route tables per resource
│   └── utils/token.js        # Access / refresh token signing
├── tests                     # Jest + Supertest integration tests
└── .github/workflows         # ci.yml, cd.yml
```

`server.js` is deliberately thin and `src/app.js` exports the app without listening, which is what lets the tests drive it in-process with Supertest.

---

## Getting started

**Prerequisites:** Node.js 20 or newer, and a MongoDB you can reach (local install, Docker, or a free MongoDB Atlas cluster).

```bash
git clone https://github.com/Yasowant/node-auth-job-be.git
cd node-auth-job-be

npm install

cp .env.example .env
# then edit .env - at minimum set MONGO_URI and both JWT secrets
```

Generate real secrets rather than inventing them by hand:

```bash
openssl rand -hex 64   # run twice, once per JWT secret
```

Run it:

```bash
npm run dev     # nodemon, reloads on change
npm start       # plain node, used in production
```

The server listens on `http://localhost:4000` by default and logs the resolved Mongo host on a successful connection.

Quick check:

```bash
curl http://localhost:4000/health
```

A healthy server answers `200` with `{"status":"ok","database":"connected", ...}`. If Mongo is unreachable it answers `503` with `"degraded"` — useful, because it means a load balancer can tell the difference between "process is up" and "process is actually able to serve".

---

## Environment variables

| Variable                   | Required | Default                  | Notes |
| -------------------------- | -------- | ------------------------ | ----- |
| `PORT`                     | no       | `4000`                   | Port the HTTP server binds to |
| `NODE_ENV`                 | no       | `development`            | `production` turns on `secure` + `sameSite=none` cookies and hides stack traces in error responses |
| `MONGO_URI`                | **yes**  | —                        | Startup aborts with a clear message if unset |
| `JWT_ACCESS_SECRET`        | **yes**  | —                        | Signs short-lived access tokens |
| `JWT_REFRESH_SECRET`       | **yes**  | —                        | Signs refresh tokens; must differ from the access secret |
| `ACCESS_TOKEN_EXPIRES_IN`  | no       | —                        | e.g. `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | no       | —                        | e.g. `7d` |
| `CLIENT_URL`               | no       | `http://localhost:5173`  | Allowed CORS origin; credentials are enabled so this cannot be `*` |
| `MONGO_URI_TEST`           | no       | in-memory Mongo          | Test-only. When set, the suite uses this database instead of downloading an in-memory MongoDB |

`.env` is gitignored. `.env.example` is the committed template — keep it in sync when you add a variable.

---

## API reference

Base URL: `/api`. All responses are JSON. Authenticated routes read the `accessToken` cookie, so browser clients must send requests with `credentials: "include"`.

### CSRF protection

Before a browser makes a `POST`, `PUT`, `PATCH`, or `DELETE` request, it must call
`GET /api/csrf-token` with credentials included. Send the returned `csrfToken` in
the `X-CSRF-Token` header on every subsequent state-changing request, along with
`credentials: "include"`. The API also verifies that the request `Origin` matches
`CLIENT_URL`.

### Service

| Method | Path      | Auth | Description |
| ------ | --------- | ---- | ----------- |
| GET    | `/`       | —    | Liveness probe, returns `{ message: "API is running" }` |
| GET    | `/health` | —    | Readiness probe: `200` when Mongo is connected, `503` when not |

### Auth — `/api/auth`

| Method | Path                     | Auth      | Description |
| ------ | ------------------------ | --------- | ----------- |
| GET    | `/csrf-token`            | —         | Issues the CSRF token required by browser write requests |
| POST   | `/register`              | —         | Body: `name`, `email`, `password`, `workStatus`. Creates a `USER`. `409` if the email exists |
| POST   | `/login`                 | —         | Body: `email`, `password`. Sets `accessToken` and `refreshToken` cookies |
| GET    | `/me`                    | cookie    | Current user, minus `password` and `refreshTokens` |
| POST   | `/refresh`               | cookie    | Exchanges the refresh cookie for a fresh access cookie |
| POST   | `/forgot-password`       | —         | Body: `email`. Always `200`, so the endpoint cannot be used to enumerate accounts |
| POST   | `/reset-password/:token` | —         | Body: `password`. Consumes the reset token and clears all sessions |
| POST   | `/change-password`       | cookie    | Body: `currentPassword`, `newPassword`. Invalidates every session |
| POST   | `/logout`                | —         | Removes the current refresh token and clears cookies |
| POST   | `/logout-all`            | cookie    | Removes every refresh token for the user |
| PUT    | `/profile`               | cookie    | Partial update of profile, skills, experience, education and job preferences |
| GET    | `/users`                 | **ADMIN** | Lists all users, newest first |

### Company — `/api/company`

| Method | Path          | Auth          | Description |
| ------ | ------------- | ------------- | ----------- |
| POST   | `/`           | **RECRUITER** | Create a company |
| GET    | `/`           | —             | List all companies |
| GET    | `/:id`        | —             | Fetch one company |
| GET    | `/my/company` | **RECRUITER** | The calling recruiter's own company |
| PUT    | `/:id`        | **RECRUITER** | Update a company |
| PATCH  | `/:id/verify` | **ADMIN**     | Mark a company verified |
| DELETE | `/:id`        | **RECRUITER** | Delete a company |

> Note: `GET /:id` is declared before `GET /`, so a request to `/api/company/my/company` would match `/:id` if the specific route were not registered first. Keep specific routes above parameterised ones when you add more.

### Jobs — `/api/jobs`

| Method | Path        | Auth          | Description |
| ------ | ----------- | ------------- | ----------- |
| POST   | `/`         | **RECRUITER** | Create a job for the recruiter's own company. Defaults to `DRAFT`; send `status: "ACTIVE"` to publish immediately |
| GET    | `/`         | —             | List published jobs. Supports `page`, `limit`, `workMode`, `employmentType`, and `q` for full-text search |
| GET    | `/:id`      | —             | One job with company and poster populated; increments `viewCount` |
| GET    | `/my/jobs`  | **RECRUITER** | The calling recruiter's own jobs, in every status |
| PUT    | `/:id`      | **RECRUITER** | Update a job. Owner only; `403` otherwise. Stamps `publishedAt` the first time status becomes `ACTIVE` |
| DELETE | `/:id`      | **RECRUITER** | Delete a job. Owner only |

Only `ACTIVE` jobs appear in the public list. A job is given a slug derived from its title plus a short random suffix, so two recruiters posting the same role do not collide on the unique index.

### Error shape

Errors come back from a single middleware, so the shape is consistent:

```json
{ "message": "Invalid or expired access token" }
```

Outside production a `stack` field is included. Mongo duplicate keys become `409`, validation failures and bad ObjectIds become `400`, and JWT errors become `401`.

---

## Authentication model

1. `POST /login` verifies the password with bcrypt and issues two tokens.
2. The **access token** (short-lived, carries `userId`, `role`, and a session version) goes into the `accessToken` cookie and is what `authMiddleware` checks on every protected route.
3. The **refresh token** (long-lived) goes into the `refreshToken` cookie and is also appended to the user's `refreshTokens` array in Mongo — so a token can be revoked server-side, which a stateless JWT alone cannot do.
4. `POST /refresh` verifies the cookie *and* confirms the token is still in that array before minting a new access token.
5. `logout` pulls one token from the array; `logout-all`, `change-password` and `reset-password` empty it and increment the session version, immediately invalidating every access token too.

Both cookies are `httpOnly`, so JavaScript in the browser cannot read them — this is the main defence against token theft via XSS. In production they are additionally `secure` and `sameSite=none`, which requires HTTPS.

---

## Rate limiting

Three limiters, applied in `src/middleware/rateLimitMiddleware.js`:

| Scope | Window | Limit | Notes |
| ----- | ------ | ----- | ----- |
| `POST /api/auth/login` | 15 min | 10 | Successful logins are not counted, so a busy legitimate user is never locked out |
| `/forgot-password`, `/reset-password/:token` | 1 hour | 5 | Each request either sends mail or burns a token |
| Everything under `/api` | 15 min | 300 | A broad ceiling |

Limits are skipped when `NODE_ENV=test`, otherwise the suite would trip them in seconds.

In production the app sets `trust proxy` to `1`. That matters: behind Caddy every request arrives from `127.0.0.1`, so without it all clients share a single bucket and one visitor could lock out everyone. It is deliberately `1` and not `true` — trusting every hop lets a client forge `X-Forwarded-For` and bypass the limiter entirely.

---

## Testing

```bash
npm test              # run the suite
npm run test:coverage # with a coverage report
```

The suite spins up an isolated database, wipes collections between tests, and drives the Express app in-process. It covers registration validation and duplicate handling, bcrypt hashing, login success and failure, cookie flags, access control on `/me`, and the `ADMIN` / `RECRUITER` role guards.

**Choosing a database for tests.** By default the suite starts an in-memory MongoDB, which downloads a binary on first run. If that download is blocked on your network, or you already have a Mongo running, point the suite at it instead:

```bash
MONGO_URI_TEST=mongodb://127.0.0.1:27017/node_auth_test npm test
```

CI uses the second path with a `mongo:7` service container, so runs are fast and deterministic.

---

## Docker

```bash
docker build -t node-auth-job-be .

docker run --rm -p 4000:4000 --env-file .env node-auth-job-be
```

The image is multi-stage (dependencies resolved in a build stage, only `node_modules` and application source copied into the runtime stage), runs as the unprivileged `node` user, uses `tini` as PID 1 so `SIGTERM` reaches the app and the graceful shutdown in `server.js` actually runs, and declares a `HEALTHCHECK` against `/health`.

---

## CI/CD

Two workflows live in `.github/workflows`.

**`ci.yml`** — runs on every push and pull request to `main`:

1. Installs dependencies from the lockfile with `npm ci`, on Node 20 and 22.
2. Runs ESLint.
3. Runs the test suite against a `mongo:7` service container and uploads coverage.
4. Builds the Docker image, then starts it next to a Mongo container and waits for `/health` to return `200` — so a broken image fails the build rather than production.

**`cd.yml`** — runs on push to `main`:

1. Calls `ci.yml`. Nothing is verified until tests pass.
2. Polls the live `/health` endpoint until the new version reports healthy, for up to 12 minutes, then writes the result into the run summary.

There is no deploy step. Render watches this repository and redeploys itself on every push to `main`, so the workflow's job is to confirm the deploy actually came up rather than to perform it.

The URL it checks defaults to the production service. To point it elsewhere, set a repository **variable** (not a secret) named `RENDER_URL` under Settings → Secrets and variables → Actions → Variables.

### Required GitHub secrets

None. Deployment credentials live in Render, not in this repository.

---

## Deployment

Live at **https://node-auth-job-backend.onrender.com** — hosted on Render's free tier, with MongoDB Atlas as the database.

Render builds the `Dockerfile` in this repository and redeploys on every push to `main`. Configuration lives in the Render dashboard under Environment, not in the repo:

| Variable | Notes |
| -------- | ----- |
| `MONGO_URI` | Atlas connection string |
| `JWT_ACCESS_SECRET` | Generated in Render |
| `JWT_REFRESH_SECRET` | Generated in Render, different from the access secret |
| `ACCESS_TOKEN_EXPIRES_IN` | `15m` |
| `REFRESH_TOKEN_EXPIRES_IN` | `7d` |
| `NODE_ENV` | `production` |
| `CLIENT_URL` | Frontend origin. Required before a browser client can log in |

Two things worth knowing about the free tier: the instance sleeps after roughly 15 minutes of inactivity, so the first request afterwards takes 30–50 seconds, and there is no fixed outbound IP, so Atlas Network Access has to allow `0.0.0.0/0`. That makes the database password the only thing protecting the data — it must be long, random, and used nowhere else.

`docs/DEPLOYMENT.md` covers the self-hosted route (AWS EC2 with Docker and Caddy) if you later want to move off Render. `scripts/server-setup.sh` bootstraps such a server in one command.

---

## Known issues

1. **Password reset has no delivery mechanism.** `forgotPassword` prints the reset token to the server console. It needs an email provider — Resend, SES or Postmark — before the flow is usable outside local development. This is the last real gap.

2. **Validation is shallow beyond credentials.** Email and password are checked at the boundary, but richer payloads (profile updates, job postings) are still only checked for presence. A schema validator such as `zod` per route would make `400`s uniform.

3. **`forgot-password` timing is observable.** The response is identical whether or not the account exists, but the branch that finds a user does bcrypt and database work, so response time still leaks membership to a patient attacker.

### Recently fixed

- `login` was signing the **entire user document** — including the bcrypt password hash — into the refresh token and sending it to the browser in a cookie. It now signs only `user._id`.
- `refreshAccessToken` produced tokens with `userId` and `role` `undefined`, so every refreshed session failed authorisation.
- `createCompany` called `res.status("409")` with a string, which Express 5 rejects — duplicates returned a `500` instead of a `409`.
- The jobs controller was four empty functions; `POST /api/jobs` never responded. The resource is now complete, including update and delete with ownership checks.
- `/login`, `/forgot-password` and `/reset-password` had no rate limiting.
- `refreshTokens` grew by one on every login forever. Dead tokens are now pruned and concurrent sessions capped at 10.
- Registration accepted any string as an email and any length of password.

---

## License

ISC
