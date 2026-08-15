import { describe, expect, it } from "vitest";
import { avatarObjectPath, parseAvatarPath } from "./profile-photos";

const USER = "11111111-1111-4111-8111-111111111111";

describe("avatarObjectPath", () => {
  it("stores one jpeg per user", () => {
    expect(avatarObjectPath(USER)).toBe(`${USER}/avatar.jpg`);
  });
});

describe("parseAvatarPath", () => {
  it("accepts the owner path format", () => {
    expect(parseAvatarPath(`${USER}/avatar.jpg`)).toEqual({ userId: USER });
  });

  it("rejects other paths", () => {
    expect(parseAvatarPath(null)).toBeNull();
    expect(parseAvatarPath(`${USER}/511.jpg`)).toBeNull();
    expect(parseAvatarPath(`${USER}/avatar.png`)).toBeNull();
    expect(parseAvatarPath("not-a-uuid/avatar.jpg")).toBeNull();
  });
});
