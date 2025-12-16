// netlify/functions/model-answer.mjs
import OpenAI from "openai";

const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

// ===== Allowed option lists (must match your tool) =====

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

// ===== Helpers =====

function safeJsonParse(text) {
  try { return JSON.parse(text); } catch { return null; }
}

function cleanString(v) {
  return (typeof v === "string" ? v.trim() : "");
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

function salvageJson(raw) {
  const direct = safeJsonParse(raw);
  if (direct) return direct;
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) {
    return safeJsonParse(raw.slice(start, end + 1));
  }
  return null;
}

// ===== Main handler =====

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
    try { body = JSON.parse(event.body || "{}"); } catch { body = {}; }

    const clientAge = cleanString(body.clientAge || "");
    const vignette = String(body.vignette || "");

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

CLIENT AGE GROUP (optional context): ${clientAge || "(not provided)"}

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
- Step 4: choose EXACTLY 2 differential diagnosis strings from ALLOWED DIAGNOSES.
- Step 5 is REQUIRED for ALL age groups. Choose 3–6 items from ALLOWED ASSESSMENTS.
  Prefer age-appropriate tools (e.g., WISC/WPPSI + CBCL/SDQ for youth).
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
    "step5": ["string","string","string"],
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
    const data = salvageJson(raw);

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

    // ===== Build + enforce =====
    const m = data.model;

    const step6Clean = cleanString(m.step6);

    const out = {
      model: {
        step1: cleanString(m.step1),
        step2: cleanString(m.step2),
        step3: cleanString(m.step3),
        step4: filterToAllowed(m.step4, ALLOWED_DX, 2),
        step4_rationale: cleanString(m.step4_rationale),
        step5: filterToAllowed(m.step5, ALLOWED_ASSESSMENTS, 6),
        step6: inList(step6Clean, ALLOWED_MODALITIES) ? step6Clean : "",
        step7: filterToAllowed(m.step7, ALLOWED_STRATEGIES, 4),
      },
    };

    // Enforce diagnosis strictly too (prevents invalid / mismatched strings)
    out.model.step3 = inList(out.model.step3, ALLOWED_DX) ? out.model.step3 : "";

    // ===== Repair Step 5 if too short (common for youth cases) =====
    if (out.model.step5.length < 3) {
      const repairPrompt = `
You returned too few Step 5 assessment items.

CLIENT AGE GROUP (optional context): ${clientAge || "(not provided)"}

VIGNETTE:
${vignette}

Return ONLY JSON:
{ "step5": ["string","string","string"] }

Rules:
- Choose 3–6 items ONLY from this list (exact spelling):
${ALLOWED_ASSESSMENTS.map(a => `- ${a}`).join("\n")}
`.trim();

      const repairResp = await client.responses.create({
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        instructions: "Return ONLY valid JSON. No markdown. No extra keys.",
        input: repairPrompt,
        temperature: 0.2,
      });

      const repairRaw = (repairResp.output_text || "").trim();
      const repairData = salvageJson(repairRaw);

      const repaired = filterToAllowed(repairData?.step5, ALLOWED_ASSESSMENTS, 6);
      if (repaired.length >= 3) out.model.step5 = repaired;
    }

    // ===== Final required-fields gate =====
    if (
      !out.model.step1 ||
      !out.model.step2 ||
      !out.model.step3 ||
      out.model.step4.length !== 2 ||
      out.model.step5.length < 3 ||
      !out.model.step6 ||
      out.model.step7.length < 2
    ) {
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Model response did not comply with required structure/options. Try again.",
          raw,
          out, // helpful during testing; remove later if you prefer
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
