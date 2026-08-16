// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

/**
 * "forward" action — sends the inbound email on to `action.to` via the
 * Worker's `send_email` binding (`env.EMAIL`). Cloudflare only allows
 * sending to *verified* destination addresses; an unverified/failed
 * destination is handled explicitly (logged + recorded in R2) rather than
 * silently dropped — the original email is already stored in the mailbox
 * regardless of whether the forward succeeds.
 */
import { sendEmail } from "../../email-sender";
import type { ActionContext, ActionHandler } from "./types";
import { actionDedupeKey } from "./types";
import type { ForwardAction } from "../../config/schema";

export const forwardAction: ActionHandler<ForwardAction> = async (action, ctx) => {
	const { env, rule, email } = ctx;
	const dedupeKey = actionDedupeKey("forward", rule, email);

	if (await env.BUCKET.head(dedupeKey)) {
		console.log(`forward action already ran for rule "${rule.name}" / email ${email.messageId}, skipping`);
		return;
	}

	try {
		await sendEmail(env.EMAIL, {
			to: action.to,
			from: { email: email.mailboxId, name: email.mailboxId },
			subject: `Fwd: ${email.subject}`,
			text: `---------- Forwarded message ----------\nFrom: ${email.sender}\nSubject: ${email.subject}\n\n${email.bodySnippet}`,
		});
		await env.BUCKET.put(
			dedupeKey,
			JSON.stringify({ status: "sent", to: action.to, at: new Date().toISOString() }),
		);
	} catch (e) {
		const message = (e as Error).message;
		console.error(
			`forward action failed for rule "${rule.name}" (to=${action.to}, likely an unverified destination address): ${message}`,
		);
		// Record the failure explicitly instead of dropping it — the email
		// itself is still safely stored in the mailbox's inbox.
		await env.BUCKET.put(
			dedupeKey,
			JSON.stringify({ status: "failed", to: action.to, error: message, at: new Date().toISOString() }),
		);
	}
};
