// netlify/functions/model-answer.mjs
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

    const clientAge = (body.clientAge || "").toString().slice(0, 60);
    const vignette = (body.vignette || "").toString();
    const userChosenDx = (body.userChosenDx || body.chosenDx || "").toString().slice(0, 120);

    if (!vignette.trim()) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: "Missing vignette." }),
      };
    }

    const instructions = [
      "You generate educational model answers for Australian NPE-style case reasoning practice.",
      "Do NOT include real identifying details.",
      "Do NOT provide medical or legal advice.",
      "Return ONLY valid JSON. No markdown. No extra keys.",
      "Be concise, exam-like, and specific to the vignette.",
    ].join("\n");

    const prompt = `
You will be given a fictional vignette. Produce a model answer for Steps 1–7.

VIGNETTE:
${vignette}

Optional: User chose diagnosis (may be wrong): ${userChosenDx || "(not provided)"}

OUTPUT RULES:
- Step 1: 1–2 sentences. MUST include timeframe + impairment. No DSM labels here.
- Step 2: Mechanisms/maintaining factors. No DSM labels here.
- Step 3: Provide ONE best-fit DSM-5 diagnosis label.
- Step 4: Provide 2–4 differentials (DSM labels). Provide 1 line rule-out rationale per differential.
- Step 5: Provide 3–6 assessments (scales/interviews/tests) appropriate to the vignette. Brief rationale optional but keep concise.
- Step 6: Choose ONE primary modality (e.g., CBT/IPT/Family/etc.) appropriate to the case.
- Step 7: Choose 2–4 strategies linked to maintaining factors (names only is OK).

Return ONLY JSON with exactly these keys:
{
  "model": {
    "step1": "string",
    "step2": "string",
    "step3": "string",
    "step4": ["string","string"],
    "step4_rationale": "string",
    "step5": ["string","string"],
    "step6": "string",
    "step7": ["string","string"]
  }
}
`.trim();

    const resp = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions,
      input: prompt,
      temperature: 0.4,
    });

    const raw = (resp.output_text || "").trim();

    let data = safeJsonParse(raw);
    if (!data) {
      const start = raw.indexOf("{");
      const end = raw.lastIndexOf("}");
      if (start !== -1 && end !== -1 && end > start) {
        data = safeJsonParse(raw.slice(start, end + 1));
      }
    }

    if (!data || typeof data !== "object" || !data.model) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Model did not return valid JSON with required keys.",
          raw,
        }),
      };
    }

    const m = data.model;

    // Minimal schema enforcement
    const out = {
      model: {
        step1: typeof m.step1 === "string" ? m.step1.trim() : "",
        step2: typeof m.step2 === "string" ? m.step2.trim() : "",
        step3: typeof m.step3 === "string" ? m.step3.trim() : "",
        step4: Array.isArray(m.step4) ? m.step4.slice(0, 4).map(x => String(x).trim()).filter(Boolean) : [],
        step4_rationale: typeof m.step4_rationale === "string" ? m.step4_rationale.trim() : "",
        step5: Array.isArray(m.step5) ? m.step5.slice(0, 6).map(x => String(x).trim()).filter(Boolean) : [],
        step6: typeof m.step6 === "string" ? m.step6.trim() : "",
        step7: Array.isArray(m.step7) ? m.step7.slice(0, 4).map(x => String(x).trim()).filter(Boolean) : [],
      }
    };

    // Ensure step1/2 exist at minimum
    if (!out.model.step1 || !out.model.step2 || !out.model.step3) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Model response missing required fields (step1/step2/step3).",
          raw,
        }),
      };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(out),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
}
