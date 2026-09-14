const {
  isEmail,
  isStrongEnough,
  validateCredentials,
} = require("../src/utils/validate");

describe("isEmail", () => {
  it.each(["a@b.co", "yasowant.1998@gmail.com", "x+tag@sub.domain.in"])(
    "accepts %s",
    (value) => {
      expect(isEmail(value)).toBe(true);
    },
  );

  it.each(["", "not-an-email", "no@tld", "two @spaces.com", null, 42, {}])(
    "rejects %p",
    (value) => {
      expect(isEmail(value)).toBe(false);
    },
  );
});

describe("isStrongEnough", () => {
  it("rejects anything under 8 characters", () => {
    expect(isStrongEnough("short")).toBe(false);
    expect(isStrongEnough("1234567")).toBe(false);
  });

  it("accepts 8 characters or more", () => {
    expect(isStrongEnough("12345678")).toBe(true);
  });

  it("rejects non-strings", () => {
    expect(isStrongEnough(undefined)).toBe(false);
    expect(isStrongEnough(12345678)).toBe(false);
  });
});

describe("validateCredentials", () => {
  it("returns null when both fields are fine", () => {
    expect(
      validateCredentials({ email: "a@b.co", password: "longenough" }),
    ).toBeNull();
  });

  it("ignores fields that were not supplied", () => {
    expect(validateCredentials({ password: "longenough" })).toBeNull();
    expect(validateCredentials({ email: "a@b.co" })).toBeNull();
  });

  it("reports the email problem first", () => {
    expect(validateCredentials({ email: "nope", password: "x" })).toMatch(
      /email/i,
    );
  });
});
