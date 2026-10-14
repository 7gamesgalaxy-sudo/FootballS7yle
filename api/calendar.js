// Vercel Serverless Function: API-Football calendar proxy
// Keep API_FOOTBALL_KEY in Vercel Environment Variables; never put it in frontend code.
module.exports = async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  // Cache responses at Vercel's edge to conserve the Free plan's daily request quota.
  res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=3600');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const teamName = String(req.query.team || '').trim();
  if (!teamName || teamName.length > 100) {
    return res.status(400).json({ error: 'Missing or invalid team name.' });
  }

  const apiKey = process.env.API_FOOTBALL_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Server API key is not configured.' });
  }

  const headers = { 'x-apisports-key': apiKey, 'Accept': 'application/json' };
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();

    
async function apiGet(path) {
  const response = await fetch(
    'https://v3.football.api-sports.io' + path,
    { headers: { 'x-apisports-key': apiKey } }
  );

  const data = await response.json().catch(() => ({}));

  if (!response.ok || (data.errors && Object.keys(data.errors).length > 0)) {
    console.error('API-Football detalle:', {
      httpStatus: response.status,
      errors: data.errors,
      message: data.message
    });

    throw new Error(
      'API-Football HTTP ' + response.status + ': ' +
      JSON.stringify(data.errors || data.message || 'Error desconocido')
    );
  }

  return data.response || [];
}


  try {
    const teams = await apiGet('/teams?search=' + encodeURIComponent(teamName));
    if (!teams.length) {
      return res.status(404).json({ error: 'No se encontró este club en API-Football.' });
    }

    const wanted = normalize(teamName);
    const selected = teams.find(item => normalize(item.team && item.team.name) === wanted) || teams[0];
    const teamId = selected && selected.team && selected.team.id;
    if (!teamId) {
      return res.status(404).json({ error: 'No se pudo identificar el club en API-Football.' });
    }

    const [past, upcoming] = await Promise.all([
      apiGet('/fixtures?team=' + teamId + '&last=2'),
      apiGet('/fixtures?team=' + teamId + '&next=2')
    ]);

    const fixtures = [...past, ...upcoming];
    const matches = fixtures.map(item => {
      const goalsHome = item.goals && item.goals.home;
      const goalsAway = item.goals && item.goals.away;
      return {
        date: item.fixture && item.fixture.date,
        homeTeam: item.teams && item.teams.home && item.teams.home.name,
        awayTeam: item.teams && item.teams.away && item.teams.away.name,
        homeScore: goalsHome === undefined ? null : goalsHome,
        awayScore: goalsAway === undefined ? null : goalsAway,
        status: item.fixture && item.fixture.status && item.fixture.status.short,
        round: item.league && item.league.round
      };
    }).filter(match => match.date && match.homeTeam && match.awayTeam);

    return res.status(200).json({ team: selected.team.name, matches });
  } catch (error) {
    console.error('API-Football calendar proxy error:', error.message);
    return res.status(502).json({ error: 'No fue posible consultar API-Football. Inténtalo más tarde.' });
  }
}
