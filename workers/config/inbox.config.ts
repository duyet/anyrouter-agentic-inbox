// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * The inbox's declarative mail configuration. This is the single
 * version-controlled source of truth for domains, mailboxes, and the
 * routing/action rules run against every inbound email — see
 * `./schema.ts` for the shape and `../../README.md` for a worked example.
 *
 * Validated with `InboxConfigSchema.parse()` below: a typo or bad shape
 * throws at module load (i.e. at Worker startup), not silently at request
 * time. `loadInboxConfig()` exists only so tests can validate arbitrary
 * config objects without re-importing this module.
 */
import { InboxConfigSchema, type InboxConfig } from "./schema";

export function loadInboxConfig(raw: unknown): InboxConfig {
	return InboxConfigSchema.parse(raw);
}

const rawConfig = {
	domains: ["anyrouter.dev"],

	// Empty by default — preserves today's behavior of allowing any address
	// on `domains` to be created as a mailbox. Declare mailboxes here once
	// you want to restrict creation to a known set, e.g.:
	//   mailboxes: [{ address: "hello@anyrouter.dev", name: "Hello" }],
	mailboxes: [],

	// No rules by default. Example rules (uncomment/adapt to enable):
	//
	// rules: [
	//   {
	//     name: "forward-support-to-duyet",
	//     match: { to: "support@anyrouter.dev" },
	//     actions: [{ type: "forward", to: "duyet@anyrouter.dev" }],
	//   },
	//   {
	//     name: "file-bug-reports-as-issues",
	//     match: { subject: "^\\[bug\\]" },
	//     actions: [
	//       {
	//         type: "github_issue",
	//         repo: "duyet/anyrouter-agentic-inbox",
	//         labels: ["bug", "from-email"],
	//       },
	//     ],
	//   },
	// ],
	rules: [],
};

/** The validated, ready-to-use inbox config. */
export const inboxConfig: InboxConfig = loadInboxConfig(rawConfig);
