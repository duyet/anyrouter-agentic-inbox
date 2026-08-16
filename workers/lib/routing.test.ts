// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { describe, expect, it } from "vitest";
import { matchRules } from "./routing";
import { InboxConfigSchema } from "../config/schema";

function config(rules: unknown[]) {
	return InboxConfigSchema.parse({ domains: ["example.com"], rules });
}

describe("matchRules", () => {
	it("matches on exact recipient address, case-insensitively", () => {
		const cfg = config([
			{ name: "r1", match: { to: "support@example.com" }, actions: [{ type: "forward", to: "a@example.com" }] },
		]);
		const matched = matchRules(cfg, { to: "support@example.com", from: "x@y.com", subject: "hi" });
		expect(matched.map((r) => r.name)).toEqual(["r1"]);

		const noMatch = matchRules(cfg, { to: "other@example.com", from: "x@y.com", subject: "hi" });
		expect(noMatch).toEqual([]);
	});

	it("matches on sender substring, case-insensitively", () => {
		const cfg = config([
			{ name: "r1", match: { from: "billing" }, actions: [{ type: "forward", to: "a@example.com" }] },
		]);
		expect(
			matchRules(cfg, { to: "any@example.com", from: "noreply@BILLING.example.com", subject: "" }),
		).toHaveLength(1);
		expect(
			matchRules(cfg, { to: "any@example.com", from: "noreply@sales.example.com", subject: "" }),
		).toHaveLength(0);
	});

	it("matches on subject regex, case-insensitively", () => {
		const cfg = config([
			{ name: "bug", match: { subject: "^\\[bug\\]" }, actions: [{ type: "forward", to: "a@example.com" }] },
		]);
		expect(matchRules(cfg, { to: "a@e.com", from: "b@e.com", subject: "[BUG] it broke" })).toHaveLength(1);
		expect(matchRules(cfg, { to: "a@e.com", from: "b@e.com", subject: "not a bug report" })).toHaveLength(0);
	});

	it("requires every condition in a rule's match to hold (AND, not OR)", () => {
		const cfg = config([
			{
				name: "combo",
				match: { to: "support@example.com", subject: "urgent" },
				actions: [{ type: "forward", to: "a@example.com" }],
			},
		]);
		expect(
			matchRules(cfg, { to: "support@example.com", from: "x@y.com", subject: "urgent request" }),
		).toHaveLength(1);
		expect(
			matchRules(cfg, { to: "support@example.com", from: "x@y.com", subject: "quiet request" }),
		).toHaveLength(0);
		expect(
			matchRules(cfg, { to: "other@example.com", from: "x@y.com", subject: "urgent request" }),
		).toHaveLength(0);
	});

	it("fails closed (never matches) on an invalid subject regex", () => {
		const cfg = config([
			{ name: "bad-regex", match: { subject: "(unterminated" }, actions: [{ type: "forward", to: "a@example.com" }] },
		]);
		expect(matchRules(cfg, { to: "a@e.com", from: "b@e.com", subject: "(unterminated" })).toEqual([]);
	});

	it("returns every matching rule, in config order", () => {
		const cfg = config([
			{ name: "r1", match: { to: "a@example.com" }, actions: [{ type: "forward", to: "x@example.com" }] },
			{ name: "r2", match: { subject: "hello" }, actions: [{ type: "forward", to: "y@example.com" }] },
		]);
		const matched = matchRules(cfg, { to: "a@example.com", from: "b@e.com", subject: "hello there" });
		expect(matched.map((r) => r.name)).toEqual(["r1", "r2"]);
	});
});
