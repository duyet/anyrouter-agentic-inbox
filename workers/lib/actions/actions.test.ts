// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runActions } from "./index";
import { actionDedupeKey, type ActionEmail } from "./types";
import type { Rule } from "../../config/schema";
import type { Env } from "../../types";

function makeBucket() {
	const store = new Map<string, string>();
	return {
		store,
		head: vi.fn(async (key: string) => (store.has(key) ? {} : null)),
		put: vi.fn(async (key: string, value: string) => {
			store.set(key, value);
		}),
	};
}

const email: ActionEmail = {
	messageId: "msg-1",
	mailboxId: "hello@example.com",
	sender: "customer@example.com",
	subject: "Help needed",
	bodySnippet: "Something broke.",
};

describe("forward action", () => {
	let bucket: ReturnType<typeof makeBucket>;
	let send: ReturnType<typeof vi.fn>;
	let env: Env;
	let rule: Rule;

	beforeEach(() => {
		bucket = makeBucket();
		send = vi.fn(async () => ({ messageId: "sent-1" }));
		env = { BUCKET: bucket, EMAIL: { send } } as unknown as Env;
		rule = {
			name: "forward-support",
			match: { to: "hello@example.com" },
			actions: [{ type: "forward", to: "team@example.com" }],
		};
	});

	it("sends the email via the send_email binding and records success", async () => {
		await runActions(env, rule, email);
		expect(send).toHaveBeenCalledTimes(1);
		const sentMessage = send.mock.calls[0][0];
		expect(sentMessage.to).toBe("team@example.com");
		expect(sentMessage.subject).toContain("Help needed");

		const dedupeKey = actionDedupeKey("forward", rule, email);
		const record = JSON.parse(bucket.store.get(dedupeKey)!);
		expect(record.status).toBe("sent");
	});

	it("is idempotent — a repeated delivery does not send twice", async () => {
		await runActions(env, rule, email);
		await runActions(env, rule, email);
		expect(send).toHaveBeenCalledTimes(1);
	});

	it("handles an unverified/failed destination explicitly instead of dropping the mail", async () => {
		send.mockRejectedValueOnce(new Error("destination address not verified"));
		await expect(runActions(env, rule, email)).resolves.toBeUndefined();

		const dedupeKey = actionDedupeKey("forward", rule, email);
		const record = JSON.parse(bucket.store.get(dedupeKey)!);
		expect(record.status).toBe("failed");
		expect(record.error).toContain("not verified");
	});
});

describe("github_issue action", () => {
	let bucket: ReturnType<typeof makeBucket>;
	let env: Env;
	let rule: Rule;
	const fetchMock = vi.fn();

	beforeEach(() => {
		bucket = makeBucket();
		env = { BUCKET: bucket, GITHUB_TOKEN: "test-token" } as unknown as Env;
		rule = {
			name: "file-bug",
			match: { subject: "bug" },
			actions: [{ type: "github_issue", repo: "duyet/anyrouter-agentic-inbox", labels: ["bug"] }],
		};
		fetchMock.mockReset();
		vi.stubGlobal("fetch", fetchMock);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("creates an issue and records the result for idempotency", async () => {
		fetchMock.mockResolvedValueOnce(
			new Response(JSON.stringify({ html_url: "https://github.com/x/y/issues/1", number: 1 }), { status: 201 }),
		);
		await runActions(env, rule, email);
		expect(fetchMock).toHaveBeenCalledTimes(1);
		const [url, init] = fetchMock.mock.calls[0];
		expect(url).toBe("https://api.github.com/repos/duyet/anyrouter-agentic-inbox/issues");
		expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-token");
		const body = JSON.parse(init.body as string);
		expect(body.title).toContain("Help needed");
		expect(body.labels).toEqual(["bug"]);
	});

	it("does not open a duplicate issue on a retried/duplicated inbound email", async () => {
		fetchMock.mockResolvedValue(
			new Response(JSON.stringify({ html_url: "https://github.com/x/y/issues/1", number: 1 }), { status: 201 }),
		);
		await runActions(env, rule, email);
		await runActions(env, rule, email);
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("skips without throwing when GITHUB_TOKEN is not configured", async () => {
		env = { BUCKET: bucket } as unknown as Env;
		await expect(runActions(env, rule, email)).resolves.toBeUndefined();
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("logs and does not record success when the GitHub API call fails", async () => {
		fetchMock.mockResolvedValueOnce(new Response("bad credentials", { status: 401 }));
		await runActions(env, rule, email);
		const dedupeKey = actionDedupeKey("github_issue", rule, email);
		expect(bucket.store.has(dedupeKey)).toBe(false);
	});
});

describe("runActions dispatcher", () => {
	it("isolates a failing action so it does not block a later one", async () => {
		const bucket = makeBucket();
		const send = vi.fn(async () => ({ messageId: "sent-1" }));
		const env = { BUCKET: bucket, EMAIL: { send } } as unknown as Env;
		const rule: Rule = {
			name: "multi-action",
			match: { to: "hello@example.com" },
			actions: [
				{ type: "github_issue", repo: "duyet/anyrouter-agentic-inbox" }, // no GITHUB_TOKEN -> handled, no throw
				{ type: "forward", to: "team@example.com" },
			],
		};
		await runActions(env, rule, email);
		expect(send).toHaveBeenCalledTimes(1);
	});
});
