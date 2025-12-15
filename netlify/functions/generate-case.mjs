// netlify/functions/generate-case.mjs
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function ageSpec(age) {
  const a = (age || "").toLowerCase().trim();

  if (a === "child") {
    return {
      label: "Child",
      ageRange: "6–12",
      settingHints:
        "Primary school context; caregiver involved; school refusal/behavioural issues may appear; language should be developmentally appropriate.",
      include:
        "Reference parent/teacher observations where relevant; focus on home/school impairment; avoid adult workplace/romantic content.",
    };
  }

  if (a === "adolescent") {
    return {
      label: "Adolescent",
      ageRange: "13–17",
      settingHints:
        "High school context; peer relationships; family conflict; identity/independence; consider risk-screening themes only if relevant.",
      include:
        "Keep it developmentally appropriate; avoid adult workplace-only framing; show impairment in school/peer/family domains.",
    };
  }

  if (a === "older adult" || a === "olderadult" || a === "older") {
    return {
      label: "Older adult",
      ageRange: "65+",
      settingHints:
        "Retirement/health changes/bereavement; consider medical contributors and cognition as differentials where appropriate.",
      include:
        "Avoid school/university framing; include functional impact (daily living, social withdrawal, sleep, health appointments).",
    };
  }

  // default adult
  return {
    label: "Adult",
    ageRange: "18–64",
    settingHints:
      "Work/relationships/independent living; typical adult service pathways (GP referral/private practice/EAP).",
    include:
      "Use adult responsibilities and realistic impairment in work/social/relationship domains.",
  };
}

export async function handler(event) {
  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    // Require POST
    if (event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers,
        body: JSON.stringify({ error: "Use POST" }),
      };
    }

    // Read inputs
    let body = {};
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      body = {};
    }

    // Updated to match your index.html:
    // - index.html sends { clientAge: "Child"|"Adolescent"|"Adult"|"Older adult" }
    // - keep backwards compatibility with { ageGroup: ... }
    const clientAge =
      (body.clientAge || body.ageGroup || "Adult").toString().slice(0, 60);

    const spec = ageSpec(clientAge);

    // IMPORTANT: No disorder passed in. Step 3 must remain a real test.
    // So we ask the model to pick ONE plausible presentation appropriate for that age group,
    // and include subtle distractors.
    const instructions = [
      "You generate fictional psychology exam-style case vignettes for study in Australia.",
      "Do NOT include real identifying details.",
      "Do NOT provide medical or legal advice.",
      "Return ONLY valid JSON. No markdown. No extra keys.",
      "The goal is to test diagnostic reasoning, so do not reveal a diagnosis label in the vignette or title.",
    ].join("\n");

    const prompt = `
Create ONE fictional case vignette for NPE-style practice.

Client age group: ${spec.label} (typical range ${spec.ageRange}).
Context guidance: ${spec.settingHints}
Constraints: ${spec.include}

Requirements:
- Vignette length: 200–320 words.
- Neutral clinical style, readable.
- Include timeframe + functional impairment.
- Include 1–2 subtle distractor features that could tempt a different diagnosis.
- Do NOT name the diagnosis or DSM label in the vignette or title.

Return ONLY JSON with exactly these keys:
{
  "title": "string (do not include diagnosis name)",
  "vignette": "string",
  "presenting_problem": "string (1 sentence stem-like presenting issue)"
}
`.trim();

    const resp = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions,
      input: prompt,
      temperature: 0.6,
    });

    const raw = (resp.output_text || "").trim();

    // Try parse; if model returns stray text, attempt a minimal cleanup.
    let data = safeJsonParse(raw);
    if (!data) {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        data = safeJsonParse(raw.slice(start, end + 1));
      }
    }

    if (!data || typeof data !== "object") {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Model did not return valid JSON.",
          raw,
        }),
      };
    }

    // Enforce the minimal schema
    const title =
      typeof data.title === "string" && data.title.trim()
        ? data.title.trim()
        : `Case vignette (${spec.label})`;

    const vignette =
      typeof data.vignette === "string" ? data.vignette.trim() : "";

    const presenting_problem =
      typeof data.presenting_problem === "string"
        ? data.presenting_problem.trim()
        : "";

    if (!vignette) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Model response missing required field: vignette.",
          raw,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        title,
        vignette,
        presenting_problem,
        clientAge: spec.label, // helpful for debugging; remove if you don’t want it
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
}
