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
  try { return JSON.parse(text); } catch { return null; }
}

function groupSpec(group) {
  const g = (group || "").toLowerCase().trim();

  // UI sends: "Child/Adolescent" or "Adult" or ""
  if (g === "child/adolescent" || g === "child" || g === "adolescent" || g === "children/adolescents") {
    return {
      label: "Child/Adolescent",
      ageRange: "7–17",
      settingHints:
        "School context and/or family context; caregiver input may be relevant; peer issues; developmentally appropriate language.",
      include:
        "Show impairment in school/peers/family; avoid adult-only workplace/romantic framing; include parent/teacher observations where helpful.",
      devNotes:
        "Apply developmental considerations where relevant (e.g., irritability can substitute for depressed mood in youth; behavioural manifestations; separation-related themes; attention/learning impacts).",
    };
  }

  // default adult (also used when UI is "")
  return {
    label: "Adult",
    ageRange: "18+",
    settingHints:
      "Work/relationships/independent living; common pathways (GP referral/private practice/EAP).",
    include:
      "Show impairment in work/social/relationships; adult responsibilities; realistic help-seeking context.",
    devNotes:
      "Use adult-typical symptom expression and examples (workplace performance, caregiving roles, relationship strain, independent living).",
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickNExcluding(arr, n, excludeSet) {
  const pool = arr.filter(x => !excludeSet.has(x));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const TARGET_DISORDERS = [
  "Delirium",
  "Major Neurocognitive Disorder",
  "Mild Neurocognitive Disorder",
  "Attention-Deficit/Hyperactivity Disorder",
  "Autism Spectrum Disorder",
  "Schizophrenia",
  "Bipolar I Disorder",
  "Bipolar II Disorder",
  "Persistent Depressive Disorder",
  "Major Depressive Disorder",
  "Generalised Anxiety Disorder",
  "Panic Disorder",
  "Separation Anxiety Disorder",
  "Social Anxiety Disorder",
  "Obsessive-Compulsive Disorder",
  "Adjustment Disorder",
  "Post-Traumatic Stress Disorder",
  "Somatic Symptom Disorder",
  "Anorexia Nervosa",
  "Bulimia Nervosa",
  "Binge-Eating Disorder",
  "Conduct Disorder",
  "Oppositional Defiant Disorder",
  "Substance Use Disorder",
  "Antisocial Personality Disorder",
  "Borderline Personality Disorder",
];

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST" }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    // UI sends: { clientAge: "" | "Child/Adolescent" | "Adult" }
    const clientAge = (body.clientAge || "").toString().slice(0, 60);
    const spec = groupSpec(clientAge);

    const correctDx = pick(TARGET_DISORDERS);
    const distractors = pickNExcluding(TARGET_DISORDERS, 3, new Set([correctDx]));
    const options = shuffle([correctDx, ...distractors]);

    const instructions = [
      "You generate fictional clinical psychology training vignettes for university-level study in Australia.",
      "Do NOT include real identifying details.",
      "Do NOT provide medical or legal advice.",
      "Return ONLY valid JSON. No markdown. No extra keys.",
      "Do NOT reveal the diagnosis label in the vignette text.",
    ].join("\n");

    const prompt = `
Create ONE fictional case vignette for diagnostic discrimination practice.

Client group: ${spec.label} (typical range ${spec.ageRange}).
Context guidance: ${spec.settingHints}
Constraints: ${spec.include}
Developmental notes: ${spec.devNotes}

Hidden target diagnosis (do NOT name it in the vignette): ${correctDx}

Vignette requirements:
- 200–320 words, neutral clinical style.
- Include timeframe + functional impairment.
- Include 1–2 subtle distractor features that could tempt another diagnosis.
- Do NOT name the diagnosis or DSM label in the vignette.

Explanation requirements:
- 80–140 words.
- Explicitly name the correct diagnosis (allowed here).
- Give 2–3 supporting features from the vignette.
- Briefly rule out TWO plausible alternatives (1 reason each).

Return ONLY JSON with exactly these keys:
{
  "vignette": "string",
  "explanation": "string"
}
`.trim();

    const resp = await client.responses.create({
      model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
      instructions,
      input: prompt,
      temperature: 0.6,
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

    if (!data || typeof data !== "object") {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Model did not return valid JSON.", raw }) };
    }

    const vignette = typeof data.vignette === "string" ? data.vignette.trim() : "";
    const explanation = typeof data.explanation === "string" ? data.explanation.trim() : "";

    if (!vignette) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "Model response missing required field: vignette.", raw }) };
    }

    const title = `Case: ${spec.label}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        title,
        vignette,
        options,     // 4 options
        correctDx,   // correct answer
        explanation, // feedback
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err?.message || "Server error" }) };
  }
}
