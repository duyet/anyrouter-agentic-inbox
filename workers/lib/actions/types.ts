// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import type { Action, Rule } from "../../config/schema";
import type { Env } from "../../types";

/** Minimal, action-relevant view of an inbound email — not the full DB row. */
export interface ActionEmail {
	/** Internal message id (same id the email is stored under in the mailbox DO). */
	messageId: string;
	/** Resolved mailbox (recipient) address. */
	mailboxId: string;
	sender: string;
	subject: string;
	/** Plain-text-ish body snippet, already HTML-stripped where applicable. */
	bodySnippet: string;
}

export interface ActionContext {
	env: Env;
	rule: Rule;
	email: ActionEmail;
}

/** A handler for one action type. Must not throw — callers only log-and-continue. */
export type ActionHandler<A extends Action = Action> = (
	action: A,
	ctx: ActionContext,
) => Promise<void>;

/**
 * Build the R2 key used to dedupe a given action for a given email so a
 * retried/duplicated inbound delivery doesn't re-run it (e.g. doesn't file a
 * second GitHub issue or send a second forward).
 */
export function actionDedupeKey(actionType: string, rule: Rule, email: ActionEmail): string {
	return `actions/${actionType}/${email.messageId}/${encodeURIComponent(rule.name)}.json`;
}
