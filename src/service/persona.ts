import { OpenAI } from "openai";
import "@dotenvx/dotenvx/config";
import { env } from "../config/env.js";
const openai = new OpenAI({
  apiKey: env.OPEN_AI_KEY,
});

// export const generatePersona = async (name: string) => {
//   const response = await openai.chat.completions.create({
//     model: "gpt-4o-mini",
//     messages: [{ role: "user", content: `Generate a persona for ${name}` }],
//   });
//   return response.choices[0].message.content;
// };

