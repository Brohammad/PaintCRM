const {
  rankShadesHeuristic,
  inferRoomMoods,
  roomMoodSummary,
  estimatePaint,
} = require('./heuristic');

function validationError(message) {
  const err = new Error(message);
  err.name = 'ValidationError';
  return err;
}

function normalizeDominant(dominant) {
  if (!dominant || typeof dominant !== 'object') {
    throw validationError('dominant must be an object with r, g, b (0–255)');
  }

  const r = Number(dominant.r);
  const g = Number(dominant.g);
  const b = Number(dominant.b);

  if (![r, g, b].every((n) => Number.isFinite(n) && n >= 0 && n <= 255)) {
    throw validationError('dominant r, g, b must be numbers between 0 and 255');
  }

  return { r: Math.round(r), g: Math.round(g), b: Math.round(b) };
}

function validateRecommendBody({ dominant, limit }) {
  const normalized = normalizeDominant(dominant);
  let parsedLimit = 6;

  if (limit !== undefined && limit !== null) {
    parsedLimit = Number(limit);
    if (!Number.isFinite(parsedLimit) || parsedLimit < 1 || parsedLimit > 12) {
      throw validationError('limit must be between 1 and 12');
    }
    parsedLimit = Math.round(parsedLimit);
  }

  return { dominant: normalized, limit: parsedLimit };
}

function parseOpenAiPicks(content) {
  if (!content || typeof content !== 'string') {
    throw new Error('Empty OpenAI response');
  }

  let parsed;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error('OpenAI response was not valid JSON');
  }

  const picks = parsed.picks || parsed.suggestions || [];
  if (!Array.isArray(picks)) {
    throw new Error('OpenAI response missing picks array');
  }

  return picks
    .map((pick) => ({
      id: String(pick.id || pick.shadeId || '').trim(),
      reason: String(pick.reason || pick.rationale || '').trim().slice(0, 240),
    }))
    .filter((pick) => pick.id);
}

function mapPicksToSuggestions(picks, candidateMap, dominant, limit) {
  const moods = inferRoomMoods(dominant);
  const seen = new Set();

  return picks
    .map((pick) => {
      if (seen.has(pick.id)) return null;
      const shade = candidateMap.get(pick.id);
      if (!shade) return null;
      seen.add(pick.id);

      return {
        ...shade,
        score: shade.score,
        roomMoods: moods,
        moodLabel: pick.reason
          ? pick.reason.slice(0, 48) + (pick.reason.length > 48 ? '…' : '')
          : shade.moodLabel,
        reason: pick.reason || shade.reason,
        estimate: shade.estimate || estimatePaint(shade.pricePerL),
      };
    })
    .filter(Boolean)
    .slice(0, limit);
}

async function openAiRecommend({
  dominant,
  prompt,
  candidates,
  moods,
  model,
  apiKey,
  fetchImpl = globalThis.fetch,
}) {
  if (!fetchImpl) {
    throw new Error('fetch is not available');
  }

  const catalogJson = candidates.map((shade) => ({
    id: shade.id,
    name: shade.name,
    brand: shade.brand,
    hex: shade.hex,
    tags: shade.tags || [],
  }));

  const system = [
    'You are a paint colour consultant for Indian dealers (Asian Paints, Dulux, Berger, etc.).',
    'Return JSON only: {"picks":[{"id":"shade-id","reason":"one short sentence"}]}',
    'Pick up to 6 shade ids from the provided catalog only — never invent ids.',
    'Reasons should mention style, mood, or how the shade suits the room.',
  ].join(' ');

  const user = JSON.stringify({
    dominantRgb: dominant,
    roomMoods: moods,
    styleRequest: prompt || null,
    catalog: catalogJson,
  });

  const res = await fetchImpl('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errBody.slice(0, 200)}`);
  }

  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  return parseOpenAiPicks(content);
}

async function recommendShades({
  dominant,
  prompt,
  catalog,
  limit = 6,
  authenticated = false,
  fetchImpl,
}) {
  const validatedDominant = normalizeDominant(dominant);
  const moods = inferRoomMoods(validatedDominant);
  const trimmedPrompt = typeof prompt === 'string' ? prompt.trim().slice(0, 280) : '';

  const candidates = rankShadesHeuristic(validatedDominant, catalog, { limit: 24 });
  const candidateMap = new Map(candidates.map((shade) => [shade.id, shade]));

  const apiKey = process.env.OPENAI_API_KEY;
  const aiEnabled = process.env.AI_RECOMMEND_ENABLED !== 'false';
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';

  if (authenticated && aiEnabled && apiKey) {
    try {
      const picks = await openAiRecommend({
        dominant: validatedDominant,
        prompt: trimmedPrompt,
        candidates,
        moods,
        model,
        apiKey,
        fetchImpl,
      });

      const suggestions = mapPicksToSuggestions(picks, candidateMap, validatedDominant, limit);

      if (suggestions.length < limit) {
        const pickedIds = new Set(suggestions.map((s) => s.id));
        for (const shade of candidates) {
          if (suggestions.length >= limit) break;
          if (!pickedIds.has(shade.id)) {
            suggestions.push(shade);
            pickedIds.add(shade.id);
          }
        }
      }

      if (suggestions.length > 0) {
        return {
          source: 'openai',
          roomMoods: moods,
          summary: trimmedPrompt
            ? `AI picks for “${trimmedPrompt}” based on your photo.`
            : `Room reads ${moods.slice(0, 3).join(', ')} — AI-ranked for this photo.`,
          suggestions: suggestions.slice(0, limit),
        };
      }
    } catch (err) {
      // Soft-fail to heuristic — never break the dealer demo on LLM errors.
      if (typeof console !== 'undefined') {
        console.warn('[ai/recommend] OpenAI path failed, using heuristic:', err.message);
      }
    }
  }

  const suggestions = rankShadesHeuristic(validatedDominant, catalog, { limit });
  const summary = authenticated && aiEnabled && apiKey && !trimmedPrompt
    ? `${roomMoodSummary(moods)} Add a style note and tap AI picks for LLM suggestions.`
    : roomMoodSummary(moods);

  return {
    source: 'heuristic',
    roomMoods: moods,
    summary,
    suggestions,
  };
}

module.exports = {
  recommendShades,
  validateRecommendBody,
  parseOpenAiPicks,
  normalizeDominant,
  openAiRecommend,
};
