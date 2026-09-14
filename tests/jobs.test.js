const request = require("supertest");

const app = require("../src/app");
const User = require("../src/models/User");

const RECRUITER = {
  name: "Recruiter One",
  email: "recruiter@example.com",
  password: "Str0ngPassw0rd!",
  workStatus: "EXPERIENCED",
};

/** Register a user, promote them to RECRUITER, log in, return cookies. */
const loginAsRecruiter = async () => {
  await request(app).post("/api/auth/register").send(RECRUITER);

  await User.updateOne({ email: RECRUITER.email }, { role: "RECRUITER" });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: RECRUITER.email, password: RECRUITER.password });

  return res.headers["set-cookie"];
};

const createCompany = (cookies) =>
  request(app)
    .post("/api/company")
    .set("Cookie", cookies)
    .send({ name: "FOHAT Designs", slug: "fohat-designs" });

describe("POST /api/jobs", () => {
  it("rejects an unauthenticated request", async () => {
    const res = await request(app).post("/api/jobs").send({ title: "Dev" });

    expect(res.status).toBe(401);
  });

  it("requires a company before a job can be posted", async () => {
    const cookies = await loginAsRecruiter();

    const res = await request(app)
      .post("/api/jobs")
      .set("Cookie", cookies)
      .send({ title: "Backend Engineer", description: "Build APIs" });

    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/company/i);
  });

  it("requires a title and description", async () => {
    const cookies = await loginAsRecruiter();
    await createCompany(cookies);

    const res = await request(app)
      .post("/api/jobs")
      .set("Cookie", cookies)
      .send({ title: "Backend Engineer" });

    expect(res.status).toBe(400);
  });

  it("creates a job and defaults it to DRAFT", async () => {
    const cookies = await loginAsRecruiter();
    await createCompany(cookies);

    const res = await request(app)
      .post("/api/jobs")
      .set("Cookie", cookies)
      .send({
        title: "Backend Engineer",
        description: "Build and maintain the hiring API.",
        workMode: "REMOTE",
        employmentType: "FULL_TIME",
      });

    expect(res.status).toBe(201);
    expect(res.body.job.status).toBe("DRAFT");
    expect(res.body.job.publishedAt).toBeNull();
    expect(res.body.job.slug).toMatch(/^backend-engineer-[0-9a-f]{6}$/);
  });

  it("gives two jobs with the same title distinct slugs", async () => {
    const cookies = await loginAsRecruiter();
    await createCompany(cookies);

    const body = { title: "Backend Engineer", description: "Same title" };

    const first = await request(app)
      .post("/api/jobs")
      .set("Cookie", cookies)
      .send(body);

    const second = await request(app)
      .post("/api/jobs")
      .set("Cookie", cookies)
      .send(body);

    expect(first.status).toBe(201);
    expect(second.status).toBe(201);
    expect(first.body.job.slug).not.toBe(second.body.job.slug);
  });
});

describe("GET /api/jobs", () => {
  it("lists only ACTIVE jobs", async () => {
    const cookies = await loginAsRecruiter();
    await createCompany(cookies);

    await request(app)
      .post("/api/jobs")
      .set("Cookie", cookies)
      .send({ title: "Draft Role", description: "Not published" });

    await request(app)
      .post("/api/jobs")
      .set("Cookie", cookies)
      .send({
        title: "Live Role",
        description: "Published",
        status: "ACTIVE",
      });

    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(res.body.total).toBe(1);
    expect(res.body.jobs[0].title).toBe("Live Role");
    expect(res.body.jobs[0].publishedAt).not.toBeNull();
  });

  it("is publicly readable without a cookie", async () => {
    const res = await request(app).get("/api/jobs");

    expect(res.status).toBe(200);
    expect(res.body.jobs).toEqual([]);
  });
});

describe("GET /api/jobs/:id", () => {
  it("returns 404 for an id that does not exist", async () => {
    const res = await request(app).get(
      "/api/jobs/507f1f77bcf86cd799439011",
    );

    expect(res.status).toBe(404);
  });

  it("returns 400 for a malformed id", async () => {
    const res = await request(app).get("/api/jobs/not-an-object-id");

    expect(res.status).toBe(400);
  });
});

describe("GET /api/jobs/my/jobs", () => {
  it("returns the recruiter's own jobs in any status", async () => {
    const cookies = await loginAsRecruiter();
    await createCompany(cookies);

    await request(app)
      .post("/api/jobs")
      .set("Cookie", cookies)
      .send({ title: "Draft Role", description: "Not published" });

    const res = await request(app)
      .get("/api/jobs/my/jobs")
      .set("Cookie", cookies);

    expect(res.status).toBe(200);
    expect(res.body.count).toBe(1);
  });
});
