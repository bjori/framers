const USTA_BASE = "https://leagues.ustanorcal.com";

/**
 * From a USTA Teaminfo.asp HTML body: opponent home facility link → organization id + label.
 * NorCal often splits markup across table cells (`Home facility:</td><td><a href=...`), so we
 * try a strict pattern first, then search a window after "Home facility:" for organization.asp.
 */
export function parseHomeFacilityFromTeaminfo(html: string): { orgId: string; label: string } | null {
  const strict = html.match(
    /Home facility:\s*<a[^>]+href=["']([^"']*organization\.asp\?id=(\d+)[^"']*)["'][^>]*>([^<]+)<\/a>/i,
  );
  if (strict) {
    const orgId = strict[2];
    const label = strict[3].replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    if (orgId && label) return { orgId, label };
  }

  const hf = html.match(/home\s+facility\s*:/i);
  if (hf?.index == null) return null;
  const slice = html.slice(hf.index, hf.index + 1200);
  const loose = slice.match(
    /<a[^>]+href=["']([^"']*organization\.asp\?id=(\d+)[^"']*)["'][^>]*>([^<]+)<\/a>/i,
  );
  if (loose) {
    const orgId = loose[2];
    const label = loose[3].replace(/&nbsp;/gi, " ").replace(/\s+/g, " ").trim();
    if (orgId && label) return { orgId, label };
  }
  const bare = slice.match(/organization\.asp\?id=(\d+)/i);
  if (bare?.[1]) {
    return { orgId: bare[1], label: "Opponent home facility" };
  }
  return null;
}

/** NorCal often puts raw spaces in `?q=` (not URL-encoded); decodeURIComponent then throws — handle both. */
function normalizeMapsQParam(raw: string): string {
  const spaced = raw.replace(/\+/g, " ").trim();
  if (/%[0-9A-Fa-f]{2}/.test(spaced)) {
    try {
      return decodeURIComponent(spaced).replace(/\s+/g, " ").trim();
    } catch {
      return spaced.replace(/\s+/g, " ").trim();
    }
  }
  return spaced.replace(/\s+/g, " ").trim();
}

/**
 * From organization.asp HTML: prefer Google Maps ?q=… (full address in query).
 * Matches real markup: href='https://maps.google.com/?q=5801 VALLEY AVE PLEASANTON, CA 94566'
 */
export function parseStreetAddressFromOrganizationPage(html: string): string | null {
  const patterns = [
    /href=["']https?:\/\/maps\.google\.com\/\?q=([^"']+)/gi,
    /href=["']https?:\/\/www\.google\.com\/maps\/\?q=([^"']+)/gi,
  ];
  let best: string | null = null;
  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(html)) !== null) {
      const addr = normalizeMapsQParam(m[1]);
      if (addr.length >= 8) {
        // Prefer the longest ?q= (full "STREET CITY, ST ZIP" over a shorter duplicate link text)
        if (!best || addr.length > best.length) best = addr;
      }
    }
  }
  return best;
}

/**
 * Resolve NorCal away venue: Teaminfo → organization page → street address (or facility name).
 */
export async function fetchUstaOpponentVenue(opponentUstaTeamId: string): Promise<string | null> {
  const teamUrl = `${USTA_BASE}/teaminfo.asp?id=${encodeURIComponent(opponentUstaTeamId)}`;
  try {
    const teamResp = await fetch(teamUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FramersApp/1.0; +https://framers.app)" },
    });
    if (!teamResp.ok) return null;
    const teamHtml = await teamResp.text();
    const facility = parseHomeFacilityFromTeaminfo(teamHtml);
    if (!facility) return null;

    const orgUrl = `${USTA_BASE}/organization.asp?id=${encodeURIComponent(facility.orgId)}`;
    const orgResp = await fetch(orgUrl, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; FramersApp/1.0; +https://framers.app)" },
    });
    if (!orgResp.ok) return facility.label;
    const orgHtml = await orgResp.text();
    const street = parseStreetAddressFromOrganizationPage(orgHtml);
    return street ?? facility.label;
  } catch (e) {
    console.error("[USTA venue]", opponentUstaTeamId, e);
    return null;
  }
}
