const GEMINI_MODEL = "gemini-3.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function withCors(response) {
  const headers = new Headers(response.headers);
  Object.entries(CORS_HEADERS).forEach(([k, v]) => headers.set(k, v));
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/gemini/ping" && request.method === "GET") {
      return withCors(await handlePing(env));
    }

    if (url.pathname === "/api/gemini" && request.method === "POST") {
      return withCors(await handleGemini(request, env));
    }

    return new Response("StudyFlow API funcionando", {
      headers: { "Content-Type": "text/plain; charset=utf-8", ...CORS_HEADERS },
    });
  },
};

async function handlePing(env) {
  if (!env.GEMINI_API_KEY) {
    return Response.json({ error: "Falta GEMINI_API_KEY." }, { status: 500 });
  }
  const key = env.GEMINI_API_KEY;
  const testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${key.trim()}`;
  const res = await fetch(testUrl);
  const text = await res.text();
  return Response.json({
    status: res.status,
    ok: res.ok,
    keyLength: key.length,
    keyHadWhitespace: key !== key.trim(),
    bodyPreview: text.slice(0, 300),
  });
}

async function handleGemini(request, env) {
  if (!env.GEMINI_API_KEY) {
    console.error("GEMINI_API_KEY no está configurada en este Worker.");
    return Response.json(
      { error: "El servidor no tiene configurada la clave de Gemini." },
      { status: 500 }
    );
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Body inválido, se esperaba JSON." }, { status: 400 });
  }

  const { system, messages } = body;

  if (typeof system !== "string" || !system.trim()) {
    return Response.json({ error: "Falta 'system' (string)." }, { status: 400 });
  }
  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "Falta 'messages' (array no vacío)." }, { status: 400 });
  }

  const contents = messages.map((message) => ({
    role: message.role === "assistant" ? "model" : "user",
    parts: [{ text: String(message.text ?? "") }],
  }));

  if (contents[contents.length - 1].role === "model") {
    return Response.json(
      { error: "El último mensaje debe ser del usuario, no del modelo." },
      { status: 400 }
    );
  }

  let geminiResponse;
  try {
    geminiResponse = await fetch(GEMINI_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": env.GEMINI_API_KEY.trim(),
      },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: system }] },
        contents,
        generationConfig: { maxOutputTokens: 1000 },
      }),
    });
  } catch (networkError) {
    console.error("No se pudo contactar a Gemini:", networkError);
    return Response.json({ error: "No se pudo contactar a Gemini." }, { status: 502 });
  }

  if (!geminiResponse.ok) {
    const rawText = await geminiResponse.text();
    console.error("Gemini devolvió error", geminiResponse.status, rawText);
    let parsed = null;
    try {
      parsed = JSON.parse(rawText);
    } catch {}
    return Response.json(
      {
        error: `Gemini respondió con error ${geminiResponse.status}`,
        detail: parsed?.error?.message || rawText || "(sin detalle)",
      },
      { status: geminiResponse.status }
    );
  }

  const data = await geminiResponse.json();
  const parts = data?.candidates?.[0]?.content?.parts || [];
  const text = parts.map((part) => part.text || "").join("\n");

  if (!text) {
    console.error("Gemini respondió sin texto:", JSON.stringify(data));
    return Response.json(
      { error: "Gemini respondió sin contenido de texto.", finishReason: data?.candidates?.[0]?.finishReason || null },
      { status: 502 }
    );
  }

  return Response.json({ text });
}