// Klient API football-data.org (v4). Darmowy plan: 10 zapytań na minutę.
const BASE_URL = "https://api.football-data.org/v4";

function createFootballDataClient({ token, baseUrl = BASE_URL, fetchFn = fetch }) {
  async function get(path) {
    const res = await fetchFn(baseUrl + path, { headers: { "X-Auth-Token": token } });
    if (!res.ok) {
      const details = (await res.text().catch(() => "")).slice(0, 200);
      throw new Error(`football-data.org odpowiedziało ${res.status} dla ${path} ${details}`);
    }
    return res.json();
  }

  return {
    // wszystkie mecze bieżącego sezonu danych rozgrywek, np. "CL", "PL"
    getCompetitionMatches: (code) => get(`/competitions/${encodeURIComponent(code)}/matches`),
  };
}

module.exports = { createFootballDataClient };
