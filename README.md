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

### Service

| Method | Path      | Auth | Description |
| ------ | --------- | ---- | ----------- |
| GET    | `/`       | —    | Liveness probe, returns `{ message: "API is running" }` |
| GET    | `/health` | —    | Readiness probe: `200` when Mongo is connected, `503` when not |

### Auth — `/api/auth`

| Method | Path                     | Auth      | Description |
| ------ | ------------------------ | --------- | ----------- |
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
2. The **access token** (short-lived, carries `userId` and `role`) goes into the `accessToken` cookie and is what `authMiddleware` checks on every protected route.
3. The **refresh token** (long-lived) goes into the `refreshToken` cookie and is also appended to the user's `refreshTokens` array in Mongo — so a token can be revoked server-side, which a stateless JWT alone cannot do.
4. `POST /refresh` verifies the cookie *and* confirms the token is still in that array before minting a new access token.
5. `logout` pulls one token from the array; `logout-all`, `change-password` and `reset-password` empty it, killing every session.

Both cookies are `httpOnly`, so JavaScript in the browser cannot read them — this is the main defence against token theft via XSS. In production they are additionally `secure` and `sameSite=none`, which requires HTTPS.

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

1. Calls `ci.yml`. Nothing deploys unless tests pass.
2. Builds the image and pushes it to GitHub Container Registry, tagged `latest` and with the commit SHA.
3. SSHes into the server, pulls the new image, and restarts the container.
4. Polls `/health` for up to a minute. **If health never passes it rolls back to the previous image** and fails the job.

Because every image is tagged with its commit SHA, rolling back by hand is one command on the server:

```bash
docker run -d --name node-auth --restart unless-stopped \
  --env-file /opt/node-auth/.env -p 127.0.0.1:4000:4000 \
  ghcr.io/yasowant/node-auth-job-be:<previous-sha>
```

### Required GitHub secrets

Set these under **Settings → Secrets and variables → Actions**:

| Secret        | What it is |
| ------------- | ---------- |
| `EC2_HOST`    | Public IP or DNS name of the server |
| `EC2_USER`    | SSH user (`ec2-user` on Amazon Linux, `ubuntu` on Ubuntu) |
| `EC2_SSH_KEY` | The **private** key, whole file including the BEGIN/END lines |
| `GHCR_TOKEN`  | A GitHub personal access token with `read:packages`, used by the server to pull the image |

`GITHUB_TOKEN` is provided automatically and needs no configuration.

---

## Deployment

Step-by-step server setup — including the free-tier-friendly AWS path — is in **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)**.

The short version: any Linux host with Docker installed, a `/opt/node-auth/.env` file containing the production environment, and an SSH key that GitHub Actions can use will work. Nginx or Caddy in front of it terminates TLS, which you need because production cookies are `secure`.

---

## Known issues

Honest list of what is still outstanding.

1. **No rate limiting.** `/login`, `/forgot-password` and `/reset-password/:token` accept unlimited attempts, which makes credential stuffing and reset-token brute force cheap. `express-rate-limit` on those three routes would close it.

2. **Password reset has no delivery mechanism.** `forgotPassword` prints the reset token to the server console. It needs an email provider before it is usable outside local development.

3. **No request body validation.** Controllers check that fields are present but not that they are the right shape, so type confusion reaches Mongoose. A schema validator such as `zod` at the route boundary would give consistent `400`s.

4. **`refreshTokens` grows without bound.** Every login appends an entry and nothing prunes expired ones, so the user document inflates over time.

5. **Jobs cannot yet be updated or deleted.** `POST`, list, detail and "my jobs" exist; `PUT /:id` and `DELETE /:id` do not.

### Recently fixed

- `login` was signing the **entire user document** — including the bcrypt password hash — into the refresh token and sending it to the browser in a cookie. It now signs only `user._id`.
- `refreshAccessToken` was producing tokens with `userId` and `role` set to `undefined`, so every refreshed session failed authorisation. It now passes the user document.
- `createCompany` called `res.status("409")` with a string, which Express 5 rejects — a duplicate company returned a `500` instead of a `409`.
- The jobs controller was four empty functions, so `POST /api/jobs` never responded and the request hung until the client timed out.

---

## License

ISC
