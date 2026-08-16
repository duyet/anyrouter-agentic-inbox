// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Declarative, version-controlled schema for the inbox's mail configuration:
 * which domains/addresses this inbox owns, and the rules that decide what
 * happens to an incoming email (forward it, file a GitHub issue, ...).
 *
 * This is the single source of truth for mailbox/address setup — see
 * `./inbox.config.ts` for the actual config and `../../README.md` for a
 * worked example. Validated with `InboxConfigSchema.parse()` at module load
 * so a malformed config throws immediately at startup instead of silently
 * no-op'ing at request time (see `inbox.config.ts`).
 */
import { z } from "zod";

// ── Actions ──────────────────────────────────────────────────────────
//
// Each action type gets its own schema, joined into `ActionSchema` with a
// discriminated union on `type`. Adding a new action type means: add a
// schema here, add it to the union, and add a handler in
// `../lib/actions/index.ts` — the dispatcher itself never changes.

export const ForwardActionSchema = z.object({
	type: z.literal("forward"),
	/** Destination address. Must be verified in Cloudflare Email Routing. */
	to: z.string().email(),
});

export const GithubIssueActionSchema = z.object({
	type: z.literal("github_issue"),
	/** `owner/repo` to file the issue against. */
	repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "repo must look like 'owner/repo'"),
	labels: z.array(z.string()).optional(),
});

export const ActionSchema = z.discriminatedUnion("type", [
	ForwardActionSchema,
	GithubIssueActionSchema,
]);

export type ForwardAction = z.infer<typeof ForwardActionSchema>;
export type GithubIssueAction = z.infer<typeof GithubIssueActionSchema>;
export type Action = z.infer<typeof ActionSchema>;

// ── Rules ────────────────────────────────────────────────────────────

const RuleMatchSchema = z
	.object({
		/** Exact recipient (mailbox) address, case-insensitive. */
		to: z.string().email().optional(),
		/** Case-insensitive substring match against the sender address. */
		from: z.string().min(1).optional(),
		/** Regex (tested case-insensitively) against the subject line. */
		subject: z.string().min(1).optional(),
	})
	.refine((m) => m.to || m.from || m.subject, {
		message: "a rule's match needs at least one of to/from/subject",
	});

export const RuleSchema = z.object({
	name: z.string().min(1),
	match: RuleMatchSchema,
	actions: z.array(ActionSchema).min(1),
});

export type RuleMatch = z.infer<typeof RuleMatchSchema>;
export type Rule = z.infer<typeof RuleSchema>;

// ── Top-level config ─────────────────────────────────────────────────

const MailboxConfigSchema = z.object({
	/** The mailbox address, e.g. `hello@example.com`. */
	address: z.string().email(),
	/** Display name shown in the UI. */
	name: z.string().min(1),
});

export type MailboxConfig = z.infer<typeof MailboxConfigSchema>;

export const InboxConfigSchema = z.object({
	/** Domains this inbox receives mail for. */
	domains: z.array(z.string().min(1)).min(1),
	/**
	 * Mailboxes this config declares up front. Optional — an empty list
	 * preserves today's behavior of allowing any address on `domains` to be
	 * created as a mailbox through the UI/API.
	 */
	mailboxes: z.array(MailboxConfigSchema).default([]),
	/** Routing/action rules evaluated (in order) against every inbound email. */
	rules: z.array(RuleSchema).default([]),
});

export type InboxConfig = z.infer<typeof InboxConfigSchema>;
