// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, expect, it } from "vitest";
import { InboxConfigSchema } from "./schema";
import { loadInboxConfig } from "./inbox.config";

describe("InboxConfigSchema", () => {
	it("accepts a minimal valid config and fills in defaults", () => {
		const config = InboxConfigSchema.parse({ domains: ["example.com"] });
		expect(config.domains).toEqual(["example.com"]);
		expect(config.mailboxes).toEqual([]);
		expect(config.rules).toEqual([]);
	});

	it("accepts a config with mailboxes and rules", () => {
		const config = InboxConfigSchema.parse({
			domains: ["example.com"],
			mailboxes: [{ address: "hello@example.com", name: "Hello" }],
			rules: [
				{
					name: "forward-support",
					match: { to: "support@example.com" },
					actions: [{ type: "forward", to: "team@example.com" }],
				},
			],
		});
		expect(config.mailboxes).toHaveLength(1);
		expect(config.rules[0].actions[0]).toEqual({ type: "forward", to: "team@example.com" });
	});

	it("rejects an empty domains list (fail loudly, not silently no-op)", () => {
		expect(() => InboxConfigSchema.parse({ domains: [] })).toThrow();
	});

	it("rejects an invalid mailbox address", () => {
		expect(() =>
			InboxConfigSchema.parse({
				domains: ["example.com"],
				mailboxes: [{ address: "not-an-email", name: "Bad" }],
			}),
		).toThrow();
	});

	it("rejects a rule with no match conditions", () => {
		expect(() =>
			InboxConfigSchema.parse({
				domains: ["example.com"],
				rules: [{ name: "empty-match", match: {}, actions: [{ type: "forward", to: "a@example.com" }] }],
			}),
		).toThrow();
	});

	it("rejects a rule with zero actions", () => {
		expect(() =>
			InboxConfigSchema.parse({
				domains: ["example.com"],
				rules: [{ name: "no-actions", match: { to: "a@example.com" }, actions: [] }],
			}),
		).toThrow();
	});

	it("rejects an unknown action type", () => {
		expect(() =>
			InboxConfigSchema.parse({
				domains: ["example.com"],
				rules: [
					{ name: "bad-action", match: { to: "a@example.com" }, actions: [{ type: "delete_forever" }] },
				],
			}),
		).toThrow();
	});

	it("rejects a github_issue action with a malformed repo", () => {
		expect(() =>
			InboxConfigSchema.parse({
				domains: ["example.com"],
				rules: [
					{
						name: "bad-repo",
						match: { subject: "^bug" },
						actions: [{ type: "github_issue", repo: "not-a-repo-slug" }],
					},
				],
			}),
		).toThrow();
	});
});

describe("loadInboxConfig", () => {
	it("throws on malformed input instead of silently returning a default", () => {
		expect(() => loadInboxConfig({ domains: "not-an-array" })).toThrow();
		expect(() => loadInboxConfig(null)).toThrow();
		expect(() => loadInboxConfig(undefined)).toThrow();
	});
});
