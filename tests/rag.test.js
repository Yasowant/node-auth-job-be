// RAG tools. Voyage (embeddings) is mocked, and Atlas $vectorSearch can't run
// on the in-memory MongoDB, so Job.aggregate is spied on: these tests check
// what we SEND to Atlas and how we shape what comes back.
jest.mock("../src/agent/embeddings", () => ({
  embed: jest.fn(async (texts) => texts.map(() => [0.1, 0.2, 0.3])),
  isEnabled: jest.fn(() => true),
  DIM: 3,
}));
jest.mock("../src/config/redis", () => ({
  redisClient: {},
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
}));

const mongoose = require("mongoose");

const embeddings = require("../src/agent/embeddings");
const { handlers } = require("../src/agent/tools");
const { jobToText } = require("../src/agent/jobEmbeddings");
const Job = require("../src/models/Jobs");
const User = require("../src/models/User");

const atlasRow = {
  _id: new mongoose.Types.ObjectId(),
  title: "Angular Developer",
  company: [{ name: "Acme Health" }],
  location: { city: "Bengaluru", country: "India" },
  workMode: "REMOTE",
  employmentType: "FULL_TIME",
  experience: { min: 2, max: 4 },
  salary: { isDisclosed: false },
  skills: ["angular"],
  score: 0.8731,
};

let aggregate;

beforeEach(() => {
  jest.clearAllMocks();
  embeddings.isEnabled.mockReturnValue(true);
  aggregate = jest.spyOn(Job, "aggregate").mockResolvedValue([atlasRow]);
});

afterEach(() => aggregate.mockRestore());

describe("semantic_search_jobs", () => {
  it("embeds the query and runs $vectorSearch on ACTIVE jobs only", async () => {
    const result = await handlers.semantic_search_jobs({
      query: "UI work for doctors",
      workMode: ["REMOTE"],
      limit: 3,
    });

    expect(embeddings.embed).toHaveBeenCalledWith(["UI work for doctors"], "query");

    const stage = aggregate.mock.calls[0][0][0].$vectorSearch;
    expect(stage).toMatchObject({
      index: "job_embedding_index",
      path: "embedding",
      queryVector: [0.1, 0.2, 0.3],
      limit: 3,
      filter: { status: "ACTIVE", workMode: { $in: ["REMOTE"] } },
    });

    expect(result).toEqual([
      expect.objectContaining({
        id: String(atlasRow._id),
        company: "Acme Health",
        location: "Bengaluru, India",
        salary: "Not disclosed",
        matchScore: 0.87,
      }),
    ]);
  });

  it("falls back cleanly when RAG is not configured", async () => {
    embeddings.isEnabled.mockReturnValue(false);

    const result = await handlers.semantic_search_jobs({ query: "anything" });

    expect(result.error).toMatch(/search_jobs/);
    expect(aggregate).not.toHaveBeenCalled();
  });
});

describe("match_jobs_to_my_profile", () => {
  it("embeds the user's own profile as the query", async () => {
    const user = await User.create({
      name: "Candidate",
      email: "c@example.com",
      password: "hashed-password",
      headline: "Angular developer",
      skills: ["angular", "typescript"],
    });

    await handlers.match_jobs_to_my_profile({}, { userId: user._id });

    const [texts, type] = embeddings.embed.mock.calls[0];
    expect(type).toBe("query");
    expect(texts[0]).toMatch(/Angular developer/);
    expect(texts[0]).toMatch(/angular, typescript/);
  });

  it("asks the user to complete an empty profile instead of searching", async () => {
    const user = await User.create({
      name: "Empty",
      email: "e@example.com",
      password: "hashed-password",
    });

    const result = await handlers.match_jobs_to_my_profile({}, { userId: user._id });

    expect(result.error).toMatch(/profile/);
    expect(aggregate).not.toHaveBeenCalled();
  });
});

describe("jobToText", () => {
  it("includes the fields that carry a job's meaning", () => {
    const text = jobToText({
      title: "Angular Developer",
      skills: ["angular"],
      description: "Build dashboards",
      requirements: ["2+ years"],
      experience: { min: 2, max: 4 },
    });

    expect(text).toMatch(/Title: Angular Developer/);
    expect(text).toMatch(/Skills: angular/);
    expect(text).toMatch(/Experience: 2-4 years/);
    expect(text).toMatch(/Requirements: 2\+ years/);
  });
});
