
module.exports = async function handler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    "s-maxage=3600, stale-while-revalidate=1800"
  );

  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Método no permitido." });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;

  if (!apiKey) {
    return res.status(500).json({
      error: "Falta configurar API_FOOTBALL_KEY en Vercel."
    });
  }

  // IDs de API-Football y temporadas por defecto.
  // La temporada puede cambiar según la competición.
  const leagues = {
    premier: { id: 39, season: 2026 },
    seriea: { id: 135, season: 2026 },
    laliga: { id: 140, season: 2026 },
    bundesliga: { id: 78, season: 2026 },
    ligamx: { id: 262, season: 2026 },
    mls: { id: 253, season: 2026 },
    argentina: { id: 128, season: 2026 }
  };

  const slug = String(req.query.league || "").trim().toLowerCase();
  const selected = leagues[slug];

  if (!selected) {
    return res.status(400).json({
      error: "Liga no válida.",
      leagues: Object.keys(leagues)
    });
  }

  const requestedSeason = Number(req.query.season);
  const season =
    Number.isInteger(requestedSeason) &&
    requestedSeason >= 2000 &&
    requestedSeason <= 2100
      ? requestedSeason
      : selected.season;

  try {
    const url =
      "https://v3.football.api-sports.io/standings" +
      `?league=${selected.id}&season=${season}`;

    const response = await fetch(url, {
      headers: {
        "x-apisports-key": apiKey,
        Accept: "application/json"
      }
    });

    const data = await response.json().catch(() => ({}));

    if (!response.ok || (data.errors && Object.keys(data.errors).length)) {
      console.error("API-Football standings error:", data.errors || response.status);

      return res.status(response.status === 429 ? 429 : 502).json({
        error: "No fue posible consultar la clasificación.",
        details: data.errors || undefined
      });
    }

    const competition = data.response?.[0];

    if (!competition?.league?.standings) {
      return res.status(404).json({
        error: "No hay clasificación disponible para esa liga y temporada.",
        league: slug,
        season
      });
    }

    const standings = competition.league.standings.flat().map((row) => ({
      position: row.rank ?? null,
      team: row.team?.name ?? "",
      teamId: row.team?.id ?? null,
      played: row.all?.played ?? 0,
      wins: row.all?.win ?? 0,
      draws: row.all?.draw ?? 0,
      losses: row.all?.lose ?? 0,
      goalsFor: row.all?.goals?.for ?? 0,
      goalsAgainst: row.all?.goals?.against ?? 0,
      goalDifference: row.goalsDiff ?? 0,
      points: row.points ?? 0,
      form: row.form ?? "",
      home: row.home ?? null,
      away: row.away ?? null
    }));

    return res.status(200).json({
      ok: true,
      league: slug,
      leagueName: competition.league.name,
      season,
      updatedAt: new Date().toISOString(),
      count: standings.length,
      standings
    });
  } catch (error) {
    console.error("Stats function error:", error.message);

    return res.status(502).json({
      error: "No fue posible consultar API-Football. Inténtalo más tarde."
    });
  }
};
