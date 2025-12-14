import OpenAI from "openai";

export const handler = async (event) => {
  try {
    const client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Allow browser testing (GET) or real usage (POST)
    const params = event.httpMethod === "POST"
      ? JSON.parse(event.body || "{}")
      : {
          domain: "Assessment",
          difficulty: "Medium",
          population: "Adult",
          focus: "Anxiety"
        };

    const instructions = `
You generate fictional psychology case studies for training.
Do not include real identifying details.
Return ONLY valid JSON.
`;

    const input = `
Create ONE psychology case study with:
Domain: ${params.domain}
Difficulty: ${params.difficulty}
Population: ${params.population}
Focus: ${params.focus}

Return JSON with:
{
  "title": "...",
  "vignette": "...",
  "question": "...",
  "options": ["A ...", "B ...", "C ...", "D ..."],
  "correctAnswer": "A|B|C|D",
  "explanation": "..."
}
`;

    const response = await client.responses.create({
      model: "gpt-4.1-mini",
      input,
      temperature: 0.6
    });

    return {
      statusCode: 200,
      body: response.output_text
    };

  } catch (err) {
    return {
      statusCode: 500,
      body: JSON.stringify({ error: err.message })
    };
  }
};
