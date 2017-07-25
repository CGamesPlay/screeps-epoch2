import invariant from "../invariant";

describe("invariant", () => {
  it("passes when true", () => {
    invariant(true, "No exception");
  });

  it("fails when false", () => {
    expect(() => invariant(false, "message")).toThrow("message");
  });
});
