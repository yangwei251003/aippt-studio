import { afterEach, describe, expect, it } from "vitest";
import { createApi } from "../src/runtime.js";

const apps: Awaited<ReturnType<typeof createApi>>[] = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe("creator messages", () => {
  it("lists, marks and clears unread messages for the current creator", async () => {
    const app = await createApi({ env: { NODE_ENV: "test", PGLITE_PATH: "memory://" } });
    apps.push(app);

    const listed = await app.inject({ method: "GET", url: "/api/creator/messages" });
    expect(listed.statusCode).toBe(200);
    const first = listed.json();
    expect(first.messages).toHaveLength(5);
    expect(first.unreadCount).toBe(3);

    const marked = await app.inject({ method: "PATCH", url: "/api/creator/messages/creator-message-review", payload: { read: true } });
    expect(marked.statusCode).toBe(200);
    expect(marked.json().message.readAt).toBeTypeOf("string");

    const cleared = await app.inject({ method: "POST", url: "/api/creator/messages/read-all" });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().unreadCount).toBe(0);
    expect(cleared.json().messages.every((message: { readAt?: string }) => Boolean(message.readAt))).toBe(true);
  }, 30_000);

  it("keeps message state isolated between creators", async () => {
    const app = await createApi({ env: { NODE_ENV: "test", PGLITE_PATH: "memory://" } });
    apps.push(app);

    await app.inject({ method: "POST", url: "/api/creator/messages/read-all", headers: { "x-user-id": "creator-a" } });
    const creatorA = await app.inject({ method: "GET", url: "/api/creator/messages", headers: { "x-user-id": "creator-a" } });
    const creatorB = await app.inject({ method: "GET", url: "/api/creator/messages", headers: { "x-user-id": "creator-b" } });

    expect(creatorA.json().unreadCount).toBe(0);
    expect(creatorB.json().unreadCount).toBe(3);
  }, 30_000);
});
