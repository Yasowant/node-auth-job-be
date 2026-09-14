const request = require("supertest");

const app = require("../src/app");
const User = require("../src/models/User");

const RECRUITER = {
  name: "Company Owner",
  email: "company-owner@example.com",
  password: "Str0ngPassw0rd!",
  workStatus: "EXPERIENCED",
};

const loginAsRecruiter = async () => {
  await request(app).post("/api/auth/register").send(RECRUITER);
  await User.updateOne({ email: RECRUITER.email }, { role: "RECRUITER" });

  const res = await request(app)
    .post("/api/auth/login")
    .send({ email: RECRUITER.email, password: RECRUITER.password });

  return res.headers["set-cookie"];
};

describe("DELETE /api/company/:id", () => {
  it("removes a company owned by the recruiter", async () => {
    const cookies = await loginAsRecruiter();
    const created = await request(app)
      .post("/api/company")
      .set("Cookie", cookies)
      .send({ name: "FOHAT Designs", slug: "fohat-designs" });

    const deleted = await request(app)
      .delete(`/api/company/${created.body.company._id}`)
      .set("Cookie", cookies);

    expect(deleted.status).toBe(200);

    const after = await request(app).get(
      `/api/company/${created.body.company._id}`,
    );
    expect(after.status).toBe(404);
  });
});
