// netlify/functions/generate-case.mjs

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(statusCode, bodyObj) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
    },
    body: JSON.stringify(bodyObj),
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function safeParseJSON(str) {
  try {
    return JSON.parse(str);
  } catch {
    return null;
  }
}

function extractOutputText(responsesApiJson) {
  // Responses API commonly provides output_text; fall back to walking the output tree.
  if (typeof responsesApiJson?.output_text === "string" && responsesApiJson.output_text.trim()) {
    return responsesApiJson.output_text.trim();
  }
  const out = responsesApiJson?.output;
  if (Array.isArray(out)) {
    for (const item of out) {
      const content = item?.content;
      if (Array.isArray(content)) {
        for (const c of content) {
          const t = c?.text;
          if (typeof t === "string" && t.trim()) return t.trim();
        }
      }
    }
  }
  return "";
}

export async function handler(event) {
  // 1) Preflight
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: { ...CORS_HEADERS },
      body: "",
    };
  }

  // 2) Enforce POST
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Use POST" });
  }

  // 3) Require server-side key
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return json(500, { error: "Missing OPENAI_API_KEY env var in Netlify." });
  }

  // 4) Parse request body
  let payload = {};
  try {
    payload = event.body ? JSON.parse(event.body) : {};
  } catch {
    return json(400, { error: "Invalid JSON body." });
  }

  // Optional flags you can send from the frontend:
  // - revealKey: boolean (default false) -> include the hidden diagnosis + answers
  // - difficulty: "easy"|"medium"|"hard" (default "medium")
  // - domain: e.g. "Assessment"|"Intervention"|"Ethics" (optional)
  // - focus: free-text (optional)
  const revealKey = !!payload.revealKey;
  const difficulty = payload.difficulty || "medium";
  const domain = payload.domain || "Assessment & Intervention";
  const focus = (payload.focus || "").toString().slice(0, 400);

  // You removed DSM-5 selector, so we randomly choose a target disorder internally.
  // (You can expand/adjust this list anytime.)
  const TARGET_DISORDERS = [
    "Generalized Anxiety Disorder",
    "Social Anxiety Disorder",
    "Major Depressive Disorder",
    "Panic Disorder",
    "Obsessive-Compulsive Disorder",
    "Posttraumatic Stress Disorder",
    "Specific Phobia",
    "Persistent Depressive Disorder (Dysthymia)",
    "Adjustment Disorder (with anxiety or depressed mood)",
  ];

  const targetDisorder = pick(TARGET_DISORDERS);

  // If the user pre-selects modality/strategies in your UI, you can pass them here.
  const selectedModality = (payload.primaryModality || "").toString().slice(0, 120);
  const selectedStrategies = Array.isArray(payload.strategies)
    ? payload.strategies.map((s) => String(s).slice(0, 120)).slice(0, 4)
    : [];

  // 5) Build prompt (Structured JSON output)
  const systemPrompt = `
You generate fictional, de-identified clinical training vignettes for an Australian psychology exam practice tool.
Do NOT provide medical advice. Do NOT use real people. Keep it plausible and concise.

Return ONLY valid JSON (no markdown, no commentary) matching this schema:

{
  "case": {
    "title": string,
    "vignette": string,              // 1–2 short paragraphs; include timeframe + impairment
    "setting": string,               // e.g., "GP referral", "university counselling", "private practice"
    "demographics": string           // brief: age range, role, context (avoid identifying details)
  },
  "studentTasks": {
    "step1_presenting_issue": string,
    "step2_maintaining_factors": string,
    "step3_provisional_diagnosis": string,
    "step4_differentials": string[],
    "step5_assessments": string[],
    "step6_primary_modality": string,
    "step7_intervention_strategies": string[]
  },
  "answerKey": {
    "target_disorder": string,
    "key_symptoms": string[],
    "maintaining_factors": string[],
    "provisional_diagnosis": string,
    "differentials_with_rationale": { "name": string, "why_not_best_fit": string }[],
    "assessments_with_rationale": { "name": string, "why": string }[],
    "primary_modality_rationale": string,
    "strategies_with_rationale": { "name": string, "why": string }[]
  }
}

Rules:
- The vignette must strongly fit the target disorder, but include a couple of realistic distractors.
- StudentTasks should be BLANK prompts for the student to fill (i.e., guidance/questions), not answers.
- AnswerKey must be exam-style: concise, practical, evidence-based.
- If a "selectedModality" is provided, make the primary modality in AnswerKey match it, unless it is clearly inappropriate.
- If "selectedStrategies" are provided, include them in strategies_with_rationale when plausible.
- Keep length manageable: vignette <= 1700 characters; answer key concise.
`.trim();

  const userPrompt = `
Generate one case for exam practice.

Target disorder (hidden from student): ${targetDisorder}
Difficulty: ${difficulty}
Domain emphasis: ${domain}
User focus (optional): ${focus || "N/A"}

Preferred modality (optional): ${selectedModality || "N/A"}
Preferred strategies (optional, up to 4): ${selectedStrategies.length ? selectedStrategies.join(", ") : "N/A"}

Important: studentTasks.* should be phrased as prompts/questions (not the answers).
Return only JSON.
`.trim();

  // 6) Call OpenAI Responses API via fetch
  // (Bearer auth + /v1/responses is the current standard interface.) :contentReference[oaicite:1]{index=1}
  const model = process.env.OPENAI_MODEL || "gpt-5";

  let apiJson;
  try {
    const r = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: [{ type: "input_text", text: systemPrompt }] },
          { role: "user", content: [{ type: "input_text", text: userPrompt }] },
        ],
      }),
    });

    apiJson = await r.json();

    if (!r.ok) {
      const msg =
        apiJson?.error?.message ||
        apiJson?.error ||
        `OpenAI request failed with status ${r.status}`;
      return json(r.status, { error: msg });
    }
  } catch (err) {
    return json(500, { error: `Failed to reach OpenAI: ${err?.message || String(err)}` });
  }

  // 7) Extract and parse model JSON
  const text = extractOutputText(apiJson);
  const parsed = safeParseJSON(text);

  if (!parsed) {
    return json(500, {
      error: "Model did not return valid JSON. Try again or tighten the prompt.",
      raw: text?.slice(0, 2000) || "",
    });
  }

  // 8) If revealKey is false, strip answerKey before returning
  if (!revealKey) {
    delete parsed.answerKey;
  }

  // 9) Always include a minimal meta block (useful for debugging)
  parsed._meta = {
    model,
    revealKey,
    generatedAt: new Date().toISOString(),
  };

  return json(200, parsed);
}
