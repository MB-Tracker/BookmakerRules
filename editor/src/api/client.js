async function req(method, path, body) {
  const opts = { method, headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const res = await fetch(`/api${path}`, opts);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error || `${method} ${path} → ${res.status}`);
  }
  return res.json();
}

const enc = encodeURIComponent;

export const api = {
  // Sports
  getSports: () => req("GET", "/sports"),
  createSport: (name) => req("POST", "/sports", { name }),
  renameSport: (sport, name) => req("PUT", `/sports/${enc(sport)}`, { name }),
  deleteSport: (sport) => req("DELETE", `/sports/${enc(sport)}`),

  // Markets
  createMarket: (sport, name) => req("POST", `/sports/${enc(sport)}/markets`, { name }),
  renameMarket: (sport, market, name) => req("PUT", `/sports/${enc(sport)}/markets/${enc(market)}`, { name }),
  deleteMarket: (sport, market) => req("DELETE", `/sports/${enc(sport)}/markets/${enc(market)}`),

  // Rules — scoped to sport+market
  getRules: (sport, market) => req("GET", `/sports/${enc(sport)}/markets/${enc(market)}/rules`),
  createRule: (sport, market, data) => req("POST", `/sports/${enc(sport)}/markets/${enc(market)}/rules`, data),
  updateRule: (sport, market, rule, data) => req("PUT", `/sports/${enc(sport)}/markets/${enc(market)}/rules/${enc(rule)}`, data),
  deleteRule: (sport, market, rule) => req("DELETE", `/sports/${enc(sport)}/markets/${enc(market)}/rules/${enc(rule)}`),

  // Bookmaker assignments
  getMarketBookmakers: (sport, market) => req("GET", `/sports/${enc(sport)}/markets/${enc(market)}/bookmakers`),
  assignBookmaker: (sport, market, data) => req("POST", `/sports/${enc(sport)}/markets/${enc(market)}/bookmakers`, data),
  updateBookmakerRule: (sport, market, bm, data) => req("PUT", `/sports/${enc(sport)}/markets/${enc(market)}/bookmakers/${enc(bm)}`, data),
  touchBookmakerCheck: (sport, market, bm) => req("PATCH", `/sports/${enc(sport)}/markets/${enc(market)}/bookmakers/${enc(bm)}/check`, {}),
  removeBookmaker: (sport, market, bm) => req("DELETE", `/sports/${enc(sport)}/markets/${enc(market)}/bookmakers/${enc(bm)}`),

  // Compatibility — scoped to sport+market
  getCompatibility: (sport, market) => req("GET", `/sports/${enc(sport)}/markets/${enc(market)}/compatibility`),
  createCompatibility: (sport, market, data) => req("POST", `/sports/${enc(sport)}/markets/${enc(market)}/compatibility`, data),
  updateCompatibility: (sport, market, pair, data) => req("PUT", `/sports/${enc(sport)}/markets/${enc(market)}/compatibility/${enc(pair)}`, data),
  deleteCompatibility: (sport, market, pair) => req("DELETE", `/sports/${enc(sport)}/markets/${enc(market)}/compatibility/${enc(pair)}`),

  // Validation
  validate: () => req("GET", "/validate"),

  // Bridge mappings (read-only)
  getBookmakerAliases: () => req("GET", "/bookmaker-aliases"),
  getSportMapping: () => req("GET", "/sport-mapping"),
};
