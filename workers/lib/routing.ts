// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Routing engine: decides which config-driven rules apply to an inbound
 * email. Pure and side-effect free — matching logic only. Running the
 * matched rules' actions is `../lib/actions/index.ts::runActions`.
 */
import type { InboxConfig, Rule, RuleMatch } from "../config/schema";

export interface IncomingEmailMeta {
	/** The resolved mailbox (recipient) address, lowercased. */
	to: string;
	/** Sender address, lowercased. */
	from: string;
	subject: string;
}

function matchesRule(match: RuleMatch, email: IncomingEmailMeta): boolean {
	if (match.to && match.to.toLowerCase() !== email.to.toLowerCase()) return false;
	if (match.from && !email.from.toLowerCase().includes(match.from.toLowerCase())) return false;
	if (match.subject) {
		let re: RegExp;
		try {
			re = new RegExp(match.subject, "i");
		} catch {
			// An invalid regex in the config never matches — fail closed, not open.
			return false;
		}
		if (!re.test(email.subject)) return false;
	}
	return true;
}

/** Returns every rule (in config order) whose match conditions are all satisfied. */
export function matchRules(config: InboxConfig, email: IncomingEmailMeta): Rule[] {
	return config.rules.filter((rule) => matchesRule(rule.match, email));
}
