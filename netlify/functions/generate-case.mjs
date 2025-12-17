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
        "High school context; peer relationships; family conflict; identity/independence; include risk-screening themes only if relevant.",
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

  return {
    label: "Adult",
    ageRange: "18–64",
    settingHints:
      "Work/relationships/independent living; typical adult service pathways (GP referral/private practice/EAP).",
    include:
      "Use adult responsibilities and realistic impairment in work/social/relationship domains.",
  };
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pickNExcluding(arr, n, excludeSet) {
  const pool = arr.filter(x => !excludeSet.has(x));
  // Fisher–Yates shuffle (in place copy)
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

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const clientAge =
      (body.clientAge || body.ageGroup || "Adult").toString().slice(0, 60);

    const spec = ageSpec(clientAge);
    const correctDx = pick(TARGET_DISORDERS);

    // Build 4 options (1 correct + 3 distractors)
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
Client age group: ${spec.label} (typical range ${spec.ageRange}).
Context guidance: ${spec.settingHints}
Constraints: ${spec.include}

Hidden target diagnosis (do NOT name it in vignette): ${correctDx}

Requirements:
- Vignette length: 200–320 words.
- Neutral clinical style, readable.
- Include timeframe + functional impairment.
- Include 1–2 subtle distractor features that could tempt another diagnosis.
- Do NOT name the diagnosis or DSM label in the vignette.

Also write a short explanation (80–140 words) that:
- Names the correct diagnosis explicitly (allowed here),
- Gives 2–3 features supporting it,
- Mentions 1 reason each of TWO plausible alternatives could be less likely.

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
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Model did not return valid JSON.", raw }),
      };
    }

    const vignette = typeof data.vignette === "string" ? data.vignette.trim() : "";
    const explanation = typeof data.explanation === "string" ? data.explanation.trim() : "";

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

    const title = `Case: ${spec.label}`;

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        title,
        vignette,
        options,      // array of 4
        correctDx,    // string
        explanation,  // string
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
