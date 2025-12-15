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

    const disorder = (body.disorder || "Generalised Anxiety Disorder").toString().slice(0, 120);
    const ageGroup = (body.ageGroup || "Adult").toString().slice(0, 60);
    const setting = (body.setting || "Australian private practice").toString().slice(0, 120);

    // We generate ONLY the vignette (no answers) to support guided reasoning.
    const instructions = [
      "You generate fictional psychology exam-style case vignettes for study.",
      "Do NOT include real identifying details.",
      "Do NOT provide medical or legal advice.",
      "Return ONLY valid JSON. No markdown. No extra keys.",
    ].join("\n");

    const prompt = `
Create ONE fictional case vignette consistent with DSM-5 style features for: ${disorder}.
Population: ${ageGroup}.
Setting: ${setting}.

The vignette should be 200–320 words, written in neutral clinical language.

Return ONLY JSON with exactly these keys:
{
  "vignette": "string",
}
`.trim();

    const resp = await client.responses.create({
      model: "gpt-4.1-mini",
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
    const title = typeof data.title === "string" ? data.title : `Case vignette: ${disorder}`;
    const vignette = typeof data.vignette === "string" ? data.vignette : "";
    const presenting_problem =
      typeof data.presenting_problem === "string" ? data.presenting_problem : "";

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
      body: JSON.stringify({ title, vignette, presenting_problem }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: err?.message || "Server error" }),
    };
  }
}
