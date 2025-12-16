export async function handler(event) {
  try {
    const { clientAge = "", vignette = "", userChosenDx = "" } = JSON.parse(event.body || "{}");

    if (!vignette.trim()) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing vignette." })
      };
    }

    // IMPORTANT:
    // This function assumes you already have an OpenAI-style setup like your generate-case function.
    // If your existing function uses a different SDK pattern, paste it and I’ll match it exactly.

    const prompt = `
You are generating an educational "model answer" for an NPE-style case reasoning exercise.

INPUTS:
- Client age group: ${clientAge}
- Vignette:
${vignette}
- User selected diagnosis (optional): ${userChosenDx}

Return a JSON object with:
{
  "model": {
    "step1": "1–2 sentences with timeframe + impairment",
    "step2": "Maintaining factors (mechanisms, not labels)",
    "step3": "Single best-fit DSM-5 diagnosis",
    "step4": ["2-4 differentials"],
    "step4_rationale": "1 line per differential: why less likely",
    "step5": ["3-6 assessments (tests/scales/interview)"],
    "step6": "One primary modality",
    "step7": ["2-4 intervention strategies linked to maintaining factors"]
  }
}

Constraints:
- Be concise and exam-like.
- Don’t include disclaimers in each step (the UI already has them).
- Keep Step 1 max 2 sentences.
- Step 4 max 4 differentials.
- Step 7 max 4 strategies.
`;

    // ----- Replace the block below with YOUR existing OpenAI call style -----
    // Example using fetch to OpenAI Responses API style is omitted here
    // because your project may already be set up with a different SDK.
    // ----------------------------------------------------------------------

    return {
      statusCode: 501,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "model-answer function not yet wired to your AI provider.",
        model: {
          step1: "",
          step2: "",
          step3: "",
          step4: [],
          step4_rationale: "",
          step5: [],
          step6: "",
          step7: []
        }
      })
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: err?.message || String(err) })
    };
  }
}
