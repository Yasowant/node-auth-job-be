const request = require("supertest");
const app = require("../src/app");

describe("service endpoints", () => {
  it("GET / reports the API is running", async () => {
    const res = await request(app).get("/");

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("API is running");
  });

  it("GET /health reports a connected database", async () => {
    const res = await request(app).get("/health");

    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.database).toBe("connected");
    expect(typeof res.body.uptime).toBe("number");
  });

  it("returns 404 for an unknown route", async () => {
    const res = await request(app).get("/api/does-not-exist");

    expect(res.status).toBe(404);
  });
});
