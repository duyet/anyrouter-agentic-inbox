import { describe, expect, it } from "vitest";
import { getAccessUrls, parsePolicyAuds } from "./access";

// Regression tests for the Access config parsing that silently 403'd every
// request: a bare TEAM_DOMAIN threw out of `new URL()`, the throw was caught by
// the JWT catch, and the operator saw "Invalid or expired Access token" while
// the token was fine. These assert the shapes the Cloudflare dashboard and the
// README actually hand out.
describe("getAccessUrls", () => {
	const certs = "https://anyr.cloudflareaccess.com/cdn-cgi/access/certs";
	const issuer = "https://anyr.cloudflareaccess.com";

	it("accepts a bare team name (the form that used to throw)", () => {
		const r = getAccessUrls("anyr");
		expect(r.issuer).toBe(issuer);
		expect(r.certsUrl.toString()).toBe(certs);
	});

	it("accepts a bare hostname", () => {
		const r = getAccessUrls("anyr.cloudflareaccess.com");
		expect(r.issuer).toBe(issuer);
		expect(r.certsUrl.toString()).toBe(certs);
	});

	it("accepts the team URL", () => {
		const r = getAccessUrls(issuer);
		expect(r.issuer).toBe(issuer);
		expect(r.certsUrl.toString()).toBe(certs);
	});

	it("accepts the full certs URL without doubling the path", () => {
		const r = getAccessUrls(certs);
		expect(r.issuer).toBe(issuer);
		expect(r.certsUrl.toString()).toBe(certs);
	});

	it("tolerates surrounding whitespace", () => {
		expect(getAccessUrls("  anyr  ").issuer).toBe(issuer);
	});

	it("throws on empty input so the caller can report a config error", () => {
		expect(() => getAccessUrls("   ")).toThrow();
	});
});

describe("parsePolicyAuds", () => {
	const a = "27a65459ca6085329760195a1f6cfb1c32852a13c7f498048c3ca1fd95293580";
	const b = "71c5bb558c309ed68557ac58cd970969ef541da856050cd3f0cd85a3ed066d0f";

	it("parses a single AUD", () => {
		expect(parsePolicyAuds(a)).toEqual([a]);
	});

	// A Worker behind both a self-hosted app and the one-click Workers app gets
	// a JWT from whichever matches first — both AUDs must verify.
	it("parses multiple comma-separated AUDs", () => {
		expect(parsePolicyAuds(`${a},${b}`)).toEqual([a, b]);
	});

	it("trims whitespace and drops empty entries", () => {
		expect(parsePolicyAuds(` ${a} , , ${b} `)).toEqual([a, b]);
	});

	it("returns empty for a blank value so the caller can 500", () => {
		expect(parsePolicyAuds("  ")).toEqual([]);
	});
});
