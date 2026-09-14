const request = require("supertest");
const bcrypt = require("bcryptjs");

const app = require("../src/app");
const User = require("../src/models/User");

const VALID_USER = {
  name: "Yasowant",
  email: "yasowant@example.com",
  password: "Str0ngPassw0rd!",
  workStatus: "FRESHER",
};

/** Register then log in, returning the Set-Cookie array for authenticated calls. */
const loginAs = async (overrides = {}) => {
  const creds = { ...VALID_USER, ...overrides };

  await request(app).post("/api/auth/register").send(creds);

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: creds.email, password: creds.password });

  return res.headers["set-cookie"];
};

describe("POST /api/auth/register", () => {
  it("creates a user and never returns the password", async () => {
    const res = await request(app).post("/api/auth/register").send(VALID_USER);

    expect(res.status).toBe(201);
    expect(res.body.user.email).toBe(VALID_USER.email);
    expect(res.body.user.role).toBe("USER");
    expect(res.body.user).not.toHaveProperty("password");
  });

  it("stores the password as a bcrypt hash, not plain text", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);

    const user = await User.findOne({ email: VALID_USER.email });

    expect(user.password).not.toBe(VALID_USER.password);
    expect(await bcrypt.compare(VALID_USER.password, user.password)).toBe(true);
  });

  it("rejects a request with missing fields", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ email: VALID_USER.email });

    expect(res.status).toBe(400);
  });

  it("rejects a duplicate email", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);

    const res = await request(app).post("/api/auth/register").send(VALID_USER);

    expect(res.status).toBe(409);
  });
});

describe("POST /api/auth/login", () => {
  it("sets httpOnly access and refresh cookies on success", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    expect(res.status).toBe(200);

    const cookies = res.headers["set-cookie"].join(";");

    expect(cookies).toMatch(/accessToken=/);
    expect(cookies).toMatch(/refreshToken=/);
    expect(cookies).toMatch(/HttpOnly/i);
  });

  it("rejects a wrong password without revealing which field was wrong", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);

    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_USER.email, password: "wrong-password" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });

  it("returns the same message for an unknown email", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "nobody@example.com", password: "whatever" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Invalid email or password");
  });
});

describe("GET /api/auth/me", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).get("/api/auth/me");

    expect(res.status).toBe(401);
  });

  it("returns the current user without secrets", async () => {
    const cookies = await loginAs();

    const res = await request(app).get("/api/auth/me").set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(VALID_USER.email);
    expect(res.body.user).not.toHaveProperty("password");
    expect(res.body.user).not.toHaveProperty("refreshTokens");
    expect(res.body.user).not.toHaveProperty("resetPasswordToken");
    expect(res.body.user).not.toHaveProperty("resetPasswordExpires");
  });
});

describe("role authorisation", () => {
  it("denies a USER access to the admin-only user list", async () => {
    const cookies = await loginAs();

    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", cookies);

    expect(res.status).toBe(403);
  });

  it("allows an ADMIN to list users", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);

    await User.updateOne({ email: VALID_USER.email }, { role: "ADMIN" });

    const login = await request(app)
      .post("/api/auth/login")
      .send({ email: VALID_USER.email, password: VALID_USER.password });

    const res = await request(app)
      .get("/api/auth/users")
      .set("Cookie", login.headers["set-cookie"]);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });

  it("denies a USER the recruiter-only create-company route", async () => {
    const cookies = await loginAs();

    const res = await request(app)
      .post("/api/company")
      .set("Cookie", cookies)
      .send({ name: "FOHAT" });

    expect(res.status).toBe(403);
  });
});

describe("POST /api/auth/logout", () => {
  it("clears the auth cookies", async () => {
    const cookies = await loginAs();

    const res = await request(app)
      .post("/api/auth/logout")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);

    const cleared = res.headers["set-cookie"].join(";");

    expect(cleared).toMatch(/accessToken=;/);
    expect(cleared).toMatch(/refreshToken=;/);
  });
});

describe("POST /api/auth/refresh", () => {
  it("rejects a request with no refresh cookie", async () => {
    const res = await request(app).post("/api/auth/refresh");

    expect(res.status).toBe(401);
  });

  it("issues a new access cookie that actually authenticates", async () => {
    const cookies = await loginAs();

    const refreshed = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookies);

    expect(refreshed.status).toBe(200);

    // The refreshed token must carry userId and role, or /me returns 401.
    const res = await request(app)
      .get("/api/auth/me")
      .set("Cookie", refreshed.headers["set-cookie"]);

    expect(res.status).toBe(200);
    expect(res.body.user.email).toBe(VALID_USER.email);
  });

  it("stops working after logout-all revokes the token", async () => {
    const cookies = await loginAs();

    await request(app).post("/api/auth/logout-all").set("Cookie", cookies);

    const res = await request(app)
      .post("/api/auth/refresh")
      .set("Cookie", cookies);

    expect(res.status).toBe(401);
  });

  it("immediately revokes the existing access token after logout-all", async () => {
    const cookies = await loginAs();

    await request(app).post("/api/auth/logout-all").set("Cookie", cookies);

    const res = await request(app).get("/api/auth/me").set("Cookie", cookies);

    expect(res.status).toBe(401);
  });
});

describe("registration input validation", () => {
  it("rejects a malformed email", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_USER, email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });

  it("rejects a password under 8 characters", async () => {
    const res = await request(app)
      .post("/api/auth/register")
      .send({ ...VALID_USER, password: "short" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/8 characters/);
  });
});

describe("PUT /api/auth/profile", () => {
  it("rejects a malformed email address", async () => {
    const cookies = await loginAs();

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Cookie", cookies)
      .send({ email: "not-an-email" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/email/i);
  });
});

describe("refresh token hygiene", () => {
  it("does not accumulate a new token on every login", async () => {
    await request(app).post("/api/auth/register").send(VALID_USER);

    const credentials = {
      email: VALID_USER.email,
      password: VALID_USER.password,
    };

    for (let i = 0; i < 12; i += 1) {
      await request(app).post("/api/auth/login").send(credentials);
    }

    const user = await User.findOne({ email: VALID_USER.email });

    // Capped at MAX_REFRESH_TOKENS rather than growing to 12.
    expect(user.refreshTokens.length).toBeLessThanOrEqual(10);
  });
});
