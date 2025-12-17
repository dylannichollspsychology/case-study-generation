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

  // UI sends: "" | "Child/Adolescent" | "Adult"
  if (g === "child/adolescent" || g === "child" || g === "adolescent" || g === "children/adolescents") {
    return {
      label: "Child/Adolescent",
      ageRange: "7–17",
      settingHints:
        "School and/or family context; caregiver input may be relevant; peer issues; developmentally appropriate language.",
      include:
        "Show impairment in school/peers/family; avoid adult-only workplace/romantic framing; include parent/teacher observations where helpful.",
      devNotes:
        "Apply developmental considerations where relevant (e.g., irritability can substitute for depressed mood in youth; behavioural manifestations; separation-related themes; attention/learning impacts).",
    };
  }

  // Default adult (also used when UI is "")
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

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function pickNExcluding(arr, n, excludeSet) {
  const pool = arr.filter(x => !excludeSet.has(x));
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, n);
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

// “Near neighbours” map: correctDx -> plausible differentials (used for distractors)
const DIFFERENTIAL_MAP = {
  "Major Depressive Disorder": [
    "Persistent Depressive Disorder",
    "Adjustment Disorder",
    "Generalised Anxiety Disorder",
    "Bipolar II Disorder",
  ],
  "Persistent Depressive Disorder": [
    "Major Depressive Disorder",
    "Adjustment Disorder",
    "Generalised Anxiety Disorder",
    "Bipolar II Disorder",
  ],
  "Generalised Anxiety Disorder": [
    "Adjustment Disorder",
    "Panic Disorder",
    "Social Anxiety Disorder",
    "Obsessive-Compulsive Disorder",
  ],
  "Panic Disorder": [
    "Generalised Anxiety Disorder",
    "Social Anxiety Disorder",
    "Post-Traumatic Stress Disorder",
    "Somatic Symptom Disorder",
  ],
  "Social Anxiety Disorder": [
    "Generalised Anxiety Disorder",
    "Panic Disorder",
    "Autism Spectrum Disorder",
    "Obsessive-Compulsive Disorder",
  ],
  "Obsessive-Compulsive Disorder": [
    "Generalised Anxiety Disorder",
    "Post-Traumatic Stress Disorder",
    "Somatic Symptom Disorder",
    "Autism Spectrum Disorder",
  ],
  "Post-Traumatic Stress Disorder": [
    "Adjustment Disorder",
    "Panic Disorder",
    "Major Depressive Disorder",
    "Obsessive-Compulsive Disorder",
  ],
  "Adjustment Disorder": [
    "Major Depressive Disorder",
    "Generalised Anxiety Disorder",
    "Post-Traumatic Stress Disorder",
    "Persistent Depressive Disorder",
  ],
  "Bipolar II Disorder": [
    "Major Depressive Disorder",
    "Persistent Depressive Disorder",
    "Bipolar I Disorder",
    "Borderline Personality Disorder",
  ],
  "Bipolar I Disorder": [
    "Bipolar II Disorder",
    "Schizophrenia",
    "Substance Use Disorder",
    "Borderline Personality Disorder",
  ],
  "Schizophrenia": [
    "Bipolar I Disorder",
    "Substance Use Disorder",
    "Major Depressive Disorder",
    "Delirium",
  ],
  "Substance Use Disorder": [
    "Bipolar I Disorder",
    "Schizophrenia",
    "Major Depressive Disorder",
    "Panic Disorder",
  ],
  "Anorexia Nervosa": [
    "Bulimia Nervosa",
    "Binge-Eating Disorder",
    "Obsessive-Compulsive Disorder",
    "Major Depressive Disorder",
  ],
  "Bulimia Nervosa": [
    "Binge-Eating Disorder",
    "Anorexia Nervosa",
    "Major Depressive Disorder",
    "Borderline Personality Disorder",
  ],
  "Binge-Eating Disorder": [
    "Bulimia Nervosa",
    "Major Depressive Disorder",
    "Generalised Anxiety Disorder",
    "Substance Use Disorder",
  ],
  "Attention-Deficit/Hyperactivity Disorder": [
    "Generalised Anxiety Disorder",
    "Major Depressive Disorder",
    "Autism Spectrum Disorder",
    "Substance Use Disorder",
  ],
  "Autism Spectrum Disorder": [
    "Social Anxiety Disorder",
    "Attention-Deficit/Hyperactivity Disorder",
    "Obsessive-Compulsive Disorder",
    "Schizophrenia",
  ],
  "Oppositional Defiant Disorder": [
    "Conduct Disorder",
    "Attention-Deficit/Hyperactivity Disorder",
    "Autism Spectrum Disorder",
    "Substance Use Disorder",
  ],
  "Conduct Disorder": [
    "Oppositional Defiant Disorder",
    "Attention-Deficit/Hyperactivity Disorder",
    "Antisocial Personality Disorder",
    "Substance Use Disorder",
  ],
  "Borderline Personality Disorder": [
    "Bipolar II Disorder",
    "Major Depressive Disorder",
    "Post-Traumatic Stress Disorder",
    "Substance Use Disorder",
  ],
  "Antisocial Personality Disorder": [
    "Conduct Disorder",
    "Substance Use Disorder",
    "Borderline Personality Disorder",
    "Bipolar I Disorder",
  ],
  "Mild Neurocognitive Disorder": [
    "Major Neurocognitive Disorder",
    "Major Depressive Disorder",
    "Delirium",
    "Generalised Anxiety Disorder",
  ],
  "Major Neurocognitive Disorder": [
    "Mild Neurocognitive Disorder",
    "Delirium",
    "Major Depressive Disorder",
    "Schizophrenia",
  ],
  "Delirium": [
    "Major Neurocognitive Disorder",
    "Mild Neurocognitive Disorder",
    "Substance Use Disorder",
    "Schizophrenia",
  ],
  "Somatic Symptom Disorder": [
    "Panic Disorder",
    "Generalised Anxiety Disorder",
    "Obsessive-Compulsive Disorder",
    "Major Depressive Disorder",
  ],
  "Separation Anxiety Disorder": [
    "Generalised Anxiety Disorder",
    "Social Anxiety Disorder",
    "Post-Traumatic Stress Disorder",
    "Adjustment Disorder",
  ],
};

function buildOptions(correctDx) {
  const mapped = (DIFFERENTIAL_MAP[correctDx] || []).filter(d => d && d !== correctDx);

  // Prefer 3 mapped differentials; top-up from global pool if missing
  let distractors = [];
  if (mapped.length >= 3) {
    distractors = shuffle(mapped).slice(0, 3);
  } else {
    const exclude = new Set([correctDx, ...mapped]);
    distractors = [
      ...mapped,
      ...pickNExcluding(TARGET_DISORDERS, 3 - mapped.length, exclude),
    ];
  }

  return shuffle([correctDx, ...distractors]).slice(0, 4);
}

export async function handler(event) {
  try {
    if (event.httpMethod === "OPTIONS") return { statusCode: 200, headers, body: "" };
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST" }) };
    }

    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const clientAge = (body.clientAge || "").toString().slice(0, 60);
    const spec = groupSpec(clientAge);

    const correctDx = pick(TARGET_DISORDERS);
    const options = buildOptions(correctDx);

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

The student will choose from these 4 options (do NOT mention these labels in vignette):
${options.map((o, i) => `${i + 1}. ${o}`).join("\n")}

Vignette requirements:
- 200–320 words, neutral clinical style.
- Include timeframe + functional impairment.
- Include 1–2 subtle distractor features that could tempt one of the other options.
- Include enough information that ${correctDx} is the BEST fit of the four.
- Do NOT name the diagnosis or DSM label in the vignette.

Explanation requirements:
- 90–160 words.
- Explicitly name the correct diagnosis (allowed here).
- Give 2–3 supporting features from the vignette.
- Briefly rule out TWO of the other options (1 reason each).

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

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        title: `Case: ${spec.label}`,
        vignette,
        options,      // exactly 4
        correctDx,
        explanation,
      }),
    };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err?.message || "Server error" }) };
  }
}
