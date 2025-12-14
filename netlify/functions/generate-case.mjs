import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

export async function handler(event) {
  // Preflight (fixes "Failed to fetch" in many cases)
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST" }) };
  }

  const { disorder = "Generalised Anxiety Disorder" } = JSON.parse(event.body || "{}");

  const prompt = `
Create a fictional DSM-5-style vignette consistent with: ${disorder}.
Return ONLY valid JSON with keys: title, vignette, question.
No markdown.
`.trim();

  const resp = await client.responses.create({
    model: "gpt-4.1-mini",
    input: prompt,
  });

  return { statusCode: 200, headers, body: resp.output_text || "{}" };
}
