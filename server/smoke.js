import { GoogleGenAI } from '@google/genai';

const apiKey = process.env.GEMINI_API_KEY;

if (!apiKey || apiKey === 'your_key_here') {
  console.error('Missing GEMINI_API_KEY. Add it to the environment or .env before running the smoke test.');
  process.exit(1);
}

const ai = new GoogleGenAI({ apiKey });

function pickModelId(models) {
  const candidates = Array.isArray(models) ? models : [];
  const preferred = candidates.find((model) => /gemma/i.test(model.name || ''));
  return preferred?.name || candidates[0]?.name || null;
}

function extractFunctionCall(response) {
  if (!response) return null;

  if (Array.isArray(response.functionCalls) && response.functionCalls.length > 0) {
    return response.functionCalls[0];
  }

  const parts = response.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part && part.functionCall) {
      return part.functionCall;
    }
  }

  return null;
}

function parseFallbackJson(text) {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (error) {
    const match = text.match(/\{.*\}/s);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch (innerError) {
      return null;
    }
  }
}

async function main() {
  console.log('Listing available Gemini models...');
  const modelListResponse = await ai.models.list();
  const modelNames = (modelListResponse.models || []).map((model) => model.name).filter(Boolean);

  if (!modelNames.length) {
    console.error('No models were available from the Gemini API.');
    process.exit(1);
  }

  console.log('Available models:', modelNames.join(', '));

  const modelId = pickModelId(modelListResponse.models || []);
  if (!modelId) {
    console.error('Unable to choose a model from the Gemini API response.');
    process.exit(1);
  }

  console.log('Selected model:', modelId);

  const payload = {
    model: modelId,
    contents: [
      {
        role: 'user',
        parts: [{ text: 'Use the get_time tool to return the current UTC time.' }],
      },
    ],
    config: {
      tools: [
        {
          functionDeclarations: [
            {
              name: 'get_time',
              description: 'Return the current UTC time in ISO-8601 format.',
              parameters: {
                type: 'OBJECT',
                properties: {
                  timezone: {
                    type: 'STRING',
                    description: 'Timezone name, usually UTC.',
                  },
                },
                required: ['timezone'],
              },
            },
          ],
        },
      ],
    },
  };

  console.log('Calling model with function declaration...');
  const response = await ai.models.generateContent(payload);
  const functionCall = extractFunctionCall(response);

  if (functionCall) {
    console.log('Function calling supported. Function call received:', JSON.stringify(functionCall));
    console.log('WORKING_MODEL_ID=' + modelId);
    console.log('FUNCTION_CALLING_APPROACH=function_call');
    return;
  }

  const rawText = response.text || response.output_text || '';
  const parsed = parseFallbackJson(rawText);

  if (parsed && typeof parsed === 'object' && ((parsed.tool && parsed.args) || (parsed.name && parsed.arguments))) {
    console.log('Function calling was not available. Fallback JSON was returned and parsed successfully.');
    console.log('Parsed response:', JSON.stringify(parsed));
    console.log('WORKING_MODEL_ID=' + modelId);
    console.log('FUNCTION_CALLING_APPROACH=json_fallback');
    return;
  }

  console.log('No function call was returned and no JSON fallback was parsed. Raw model output:');
  console.log(rawText || JSON.stringify(response, null, 2));
  console.log('WORKING_MODEL_ID=' + modelId);
  console.log('FUNCTION_CALLING_APPROACH=unsupported_or_unreadable');
}

main().catch((error) => {
  console.error('Smoke test failed.');
  console.error(error?.message || error);
  process.exit(1);
});
