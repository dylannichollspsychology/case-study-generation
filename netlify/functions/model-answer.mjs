// netlify/functions/model-answer.mjs
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

const ALLOWED_DX = [
  "Attention-Deficit/Hyperactivity Disorder",
  "Autism Spectrum Disorder",
  "Schizophrenia",
  "Bipolar I Disorder",
  "Bipolar II Disorder",
  "Major Depressive Disorder",
  "Persistent Depressive Disorder",
  "Generalised Anxiety Disorder",
  "Panic Disorder",
  "Social Anxiety Disorder",
  "Separation Anxiety Disorder",
  "Obsessive-Compulsive Disorder",
  "Post-Traumatic Stress Disorder",
  "Adjustment Disorder",
  "Somatic Symptom Disorder",
  "Anorexia Nervosa",
  "Bulimia Nervosa",
  "Binge-Eating Disorder",
  "Oppositional Defiant Disorder",
  "Conduct Disorder",
  "Substance Use Disorder",
  "Borderline Personality Disorder",
  "Antisocial Personality Disorder",
  "Delirium",
  "Mild Neurocognitive Disorder",
  "Major Neurocognitive Disorder",
];

const ALLOWED_MODALITIES = [
  "Cognitive Behavioural Therapy",
  "Interpersonal Therapy",
  "Family Therapy",
  "Psychodynamic Therapy",
  "Narrative Therapy",
  "Solution-Focused Therapy",
  "Motivational Interviewing",
];

const ALLOWED_STRATEGIES = [
  "Psychoeducation",
  "Interpersonal therapy techniques",
  "Psychodynamic therapy techniques",
  "Solution-focused techniques",
  "Narrative therapy techniques",
  "Behaviour modification",
  "Gradual exposure",
  "Exposure response prevention",
  "Interoceptive exposure",
  "Prolonged exposure",
  "Cognitive restructuring",
  "Acceptance strategies",
  "Self-management",
  "Relapse prevention",
  "Progressive muscle relaxation",
  "Breathing retraining",
  "Problem solving skills training",
  "Anger management",
  "Social skills training",
  "Assertiveness skills training",
  "Stress management",
  "Mindfulness skills",
  "Parenting skills",
];

const ALLOWED_ASSESSMENTS = [
  "WAIS (Wechsler Adult Intelligence Scale)",
  "WISC (Wechsler Intelligence Scale for Children)",
  "WPPSI (Wechsler Preschool and Primary Scale of Intelligence)",
  "Stanford-Binet (Stanford-Binet Intelligence Scales)",
  "WASI (Wechsler Abbreviated Scale of Intelligence)",
  "Woodcock-Johnson Test of Cognitive Abilities",
  "Raven's Standard Progressive Matrices",
  "WIAT (Wechsler Individual Achievement Test)",
  "WMS (Wechsler Memory Scale)",
  "WRAML (Wide Range Assessment of Memory and Learning)",
  "SDS (Self Directed Search)",
  "Strong (Strong Interest Inventory)",
  "16PF (Sixteen Personality Factor Questionnaire)",
  "NEO (NEO Personality Inventory)",
  "WHO-DAS (World Health Organisation Disability Assessment Scale)",
  "WHO-QOL (World Health Organisation Quality of Life Scale)",
  "ABAS (Adaptive Behavior Assessment System)",
  "ORS (Outcome Rating Scale)",
  "BDI (Beck Depression Inventory)",
  "DASS (Depression Anxiety Stress Scale)",
  "K10 (Kessler Psychological Distress Scale)",
  "STAI (State Trait Anxiety Inventory)",
  "MMPI (Minnesota Multiphasic Personality Inventory)",
  "PAI (Personality Assessment Inventory)",
  "PHQ-9 (Patient Health Questionnaire 9 Item)",
  "Structured Clinical Interview for DSM (SCID)",
  "CBCL (Achenbach Child Behaviour Checklist)",
  "SDQ (Strengths and Difficulties Questionnaire)",
];

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function inList(x, list) {
  return list.includes(x);
}

function filterToAllowed(arr, list, maxN) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const v of arr) {
    const s = String(v || "").trim();
    if (inList(s, list) && !out.includes(s)) out.push(s);
    if (out.length >= maxN) break;
  }
  return out;
}

export async function handler(event) {
  try {
    // CORS preflight
    if (event.httpMethod === "OPTIONS") {
      return { statusCode: 200, headers, body: "" };
    }

    // Require POST
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, headers, body: JSON.stringify({ error: "Use POST" }) };
    }

    // Read inputs
    let body = {};
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const vignette = (body.vignette || "").toString();
    if (!vignette.trim()) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing vignette." }) };
    }

    const instructions = [
      "You generate educational model answers for Australian NPE-style case reasoning practice.",
      "Do NOT include real identifying details.",
      "Do NOT provide medical or legal advice.",
      "Return ONLY valid JSON. No markdown. No extra keys.",
      "Be concise, exam-like, and specific to the vignette.",
      "IMPORTANT: Do NOT include DSM labels in Step 1 or Step 2. Labels are allowed in Step 3+.",
    ].join("\n");

    const prompt = `
Create an NPE-style model answer for Steps 1–7 based on the vignette.

VIGNETTE:
${vignette}

You MUST choose ONLY from the allowed options below.

ALLOWED DIAGNOSES (Step 3 and Step 4):
${ALLOWED_DX.map(d => `- ${d}`).join("\n")}

ALLOWED ASSESSMENTS (Step 5):
${ALLOWED_ASSESSMENTS.map(a => `- ${a}`).join("\n")}

ALLOWED MODALITIES (Step 6):
${ALLOWED_MODALITIES.map(m => `- ${m}`).join("\n")}

ALLOWED STRATEGIES (Step 7):
${ALLOWED_STRATEGIES.map(s => `- ${s}`).join("\n")}

RULES:
- Step 1: 1–2 sentences; timeframe + impairment; NO DSM labels.
- Step 2: maintaining mechanisms; NO DSM labels.
- Step 3: choose EXACTLY ONE diagnosis string from ALLOWED DIAGNOSES.
- Step 4: choose 2–4 differential diagnosis strings from ALLOWED DIAGNOSES.
- Step 5: choose 3–6 items from ALLOWED ASSESSMENTS.
- Step 6: choose EXACTLY ONE item from ALLOWED MODALITIES.
- Step 7: choose 2–4 items from ALLOWED STRATEGIES.
- Use the EXACT spelling/capitalisation from the allowed lists. No synonyms.

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
      temperature: 0.3,
    });

    const raw = (resp.output_text || "").trim();

    // Parse JSON (with minimal salvage)
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
        body: JSON.stringify({ error: "Model did not return valid JSON with required keys.", raw }),
      };
    }

    const m = data.model;

    // Build output (trim + cap)
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
      },
    };

    // ENFORCE allowed lists
    out.model.step3 = inList(out.model.step3, ALLOWED_DX) ? out.model.step3 : "";
    out.model.step4 = filterToAllowed(out.model.step4, ALLOWED_DX, 4);
    out.model.step5 = filterToAllowed(out.model.step5, ALLOWED_ASSESSMENTS, 6);
    out.model.step6 = inList(out.model.step6, ALLOWED_MODALITIES) ? out.model.step6 : "";
    out.model.step7 = filterToAllowed(out.model.step7, ALLOWED_STRATEGIES, 4);

    // Required fields (after enforcement)
    if (!out.model.step1 || !out.model.step2 || !out.model.step3 || !out.model.step6 || out.model.step7.length < 2) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Model response did not comply with allowed option lists. Try again.",
          raw,
        }),
      };
    }

    return { statusCode: 200, headers, body: JSON.stringify(out) };
  } catch (err) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: err?.message || "Server error" }) };
  }
}
