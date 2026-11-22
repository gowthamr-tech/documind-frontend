import { describe, expect, it } from "vitest";
import { validateUpload } from "./upload";
import { parsePageParam, safeNext } from "./url";

describe("safeNext (open-redirect guard)", () => {
  it.each([
    ["/documents/1?page=2#x", "/documents/1?page=2#x"],
    ["/", "/"],
    [null, "/"],
    ["", "/"],
    ["https://evil.com", "/"],
    ["//evil.com", "/"],
    ["/\\evil.com", "/"],
    ["/\\/evil.com", "/"],
    ["javascript:alert(1)", "/"],
    ["documents", "/"],
  ])("%s -> %s", (input, expected) => {
    expect(safeNext(input)).toBe(expected);
  });
});

describe("parsePageParam", () => {
  it.each([
    ["3", 3], [null, 1], ["0", 1], ["-2", 1], ["abc", 1], ["2.5", 1], ["1e3", 1], ["9999999", 1],
  ])("%s -> %s", (input, expected) => {
    expect(parsePageParam(input)).toBe(expected);
  });
});

describe("validateUpload", () => {
  it("accepts supported files and explains rejections", () => {
    expect(validateUpload({ name: "Report.PDF", size: 10 })).toBeNull();
    expect(validateUpload({ name: "notes.txt", size: 10 })).toMatch(/Unsupported/);
    expect(validateUpload({ name: "noext", size: 10 })).toMatch(/Unsupported/);
    expect(validateUpload({ name: "a.png", size: 0 })).toMatch(/empty/);
    expect(validateUpload({ name: "a.png", size: 50 * 1024 * 1024 + 1 })).toMatch(/50 MB/);
  });
});
