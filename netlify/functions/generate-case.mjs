import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function handler(event) {
  // Handle CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Use POST" }),
    };
  }

  let disorder = "Generalised Anxiety Disorder";
  try {
    const body = JSON.parse(event.body || "{}");
    disorder = body.disorder || disorder;
  } catch {}

  // Keep it simple: return title + vignette (+ optional question)
  const prompt = `Create a fictional clinical-style vignette consistent with ${disorder}.
Return JSON with keys: title, vignette, question.
No markdown.`;

  const resp = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  const text = resp.output_text || "";
  return { statusCode: 200, headers, body: text };
}
