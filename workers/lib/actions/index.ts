// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * Action dispatcher. Maps a config rule's `actions` to their handlers and
 * runs them. Adding a new action type means adding a schema in
 * `../../config/schema.ts`, a handler module here, and one entry in
 * `handlers` below — this dispatcher itself never changes.
 */
import type { Action, Rule } from "../../config/schema";
import type { Env } from "../../types";
import type { ActionContext, ActionEmail, ActionHandler } from "./types";
import { forwardAction } from "./forward";
import { githubIssueAction } from "./github-issue";

const handlers: { [K in Action["type"]]: ActionHandler<Extract<Action, { type: K }>> } = {
	forward: forwardAction,
	github_issue: githubIssueAction,
};

/**
 * Run every action attached to a rule. Each action is isolated — one
 * failing/throwing action is logged and does not stop the rest, and never
 * propagates back to the email-receiving path.
 */
export async function runActions(env: Env, rule: Rule, email: ActionEmail): Promise<void> {
	for (const action of rule.actions) {
		const handler = handlers[action.type] as ActionHandler | undefined;
		if (!handler) {
			console.error(`No handler registered for action type "${action.type}" (rule "${rule.name}")`);
			continue;
		}
		const ctx: ActionContext = { env, rule, email };
		try {
			await handler(action, ctx);
		} catch (e) {
			console.error(`Action "${action.type}" failed for rule "${rule.name}": ${(e as Error).message}`);
		}
	}
}

export type { ActionEmail, ActionContext } from "./types";
