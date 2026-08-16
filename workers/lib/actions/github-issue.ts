// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * "github_issue" action — files a GitHub issue from an inbound email.
 * Requires the `GITHUB_TOKEN` secret (`wrangler secret put GITHUB_TOKEN`);
 * never read from the config file. Idempotent via an R2 marker keyed by
 * (action type, rule, email id) so a retried/duplicated inbound delivery
 * does not open a second issue.
 */
import type { GithubIssueAction } from "../../config/schema";
import type { ActionHandler } from "./types";
import { actionDedupeKey } from "./types";

const GITHUB_API = "https://api.github.com";

export const githubIssueAction: ActionHandler<GithubIssueAction> = async (action, ctx) => {
	const { env, rule, email } = ctx;
	const dedupeKey = actionDedupeKey("github_issue", rule, email);

	if (await env.BUCKET.head(dedupeKey)) {
		console.log(`github_issue action already ran for rule "${rule.name}" / email ${email.messageId}, skipping`);
		return;
	}

	if (!env.GITHUB_TOKEN) {
		console.error(
			`github_issue action for rule "${rule.name}" skipped: GITHUB_TOKEN secret is not configured (wrangler secret put GITHUB_TOKEN)`,
		);
		return;
	}

	const res = await fetch(`${GITHUB_API}/repos/${action.repo}/issues`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${env.GITHUB_TOKEN}`,
			Accept: "application/vnd.github+json",
			"User-Agent": "anyrouter-agentic-inbox",
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			title: `[email] ${email.subject || "(no subject)"}`,
			body: `Received from **${email.sender}** to **${email.mailboxId}** (rule: \`${rule.name}\`)\n\n---\n\n${email.bodySnippet}`,
			...(action.labels ? { labels: action.labels } : {}),
		}),
	});

	if (!res.ok) {
		console.error(
			`github_issue action failed for rule "${rule.name}" (${action.repo}): ${res.status} ${await res.text()}`,
		);
		return;
	}

	const issue = (await res.json()) as { html_url: string; number: number };
	await env.BUCKET.put(
		dedupeKey,
		JSON.stringify({ status: "created", issueUrl: issue.html_url, number: issue.number, at: new Date().toISOString() }),
	);
};
