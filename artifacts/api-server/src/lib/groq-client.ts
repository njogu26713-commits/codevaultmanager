import Groq from "groq-sdk";
import { logger } from "./logger";

function getGroqClient(): Groq {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY environment variable is required");
  }
  return new Groq({ apiKey });
}

export interface FileChange {
  path: string;
  content: string | null;
  action: "create" | "modify" | "delete";
}

export interface AiCodeResult {
  type: "code" | "chat";
  reply: string;       // conversational answer (always present)
  summary: string;     // one-liner shown in chat bubble for code responses
  fileChanges: FileChange[];
}

const THINKING_PROMPT = `You are a senior software engineer and developer mentor.
A developer has sent you a message — it might be a coding task OR a question about code, architecture, or development.

If it is a question or discussion: briefly describe how you will answer it (1–2 sentences).
If it is a coding task: briefly describe your implementation plan (2–3 sentences).
Be direct and technical. Do not write code yet, just your thinking.`;

const SYSTEM_PROMPT = `You are CodeVault, an expert AI software engineer and developer mentor embedded in a code editor. You work like a senior developer on the team — you write code AND answer questions, explain decisions, discuss trade-offs, and teach.

You receive messages from a developer. They may be:
- A coding task ("add a login page", "refactor this function")
- A question about the code ("why did you use X?", "what does this file do?", "what is Y for?")
- A general dev question ("what's the difference between X and Y?", "how should I structure this?")
- A mix of both

Decide which type it is and respond with valid JSON only — no markdown fences, no text outside the JSON object.

For a QUESTION or DISCUSSION, respond with:
{
  "type": "chat",
  "reply": "Your thorough, friendly developer answer here. Explain the why, trade-offs, and alternatives.",
  "summary": "One-sentence version of the reply.",
  "fileChanges": []
}

For a CODING TASK, respond with:
{
  "type": "code",
  "reply": "Brief explanation of what you did and why.",
  "summary": "One sentence describing the change.",
  "fileChanges": [
    { "path": "relative/path/to/file.ext", "action": "create", "content": "complete file content" },
    { "path": "other/file.ext", "action": "modify", "content": "complete file content" },
    { "path": "old/file.ext", "action": "delete", "content": null }
  ]
}

Rules for coding tasks:
- action must be exactly "create", "modify", or "delete"
- For create and modify, always provide the COMPLETE file content — never a diff or partial snippet
- For delete, set content to null
- ALWAYS produce at least one file change — never return an empty fileChanges array for a coding task
- If the workspace is empty or only has a README, create all necessary files from scratch
- Never include binary files, lock files, or node_modules in fileChanges
- Respect existing code architecture and style; prefer focused changes over large rewrites`;


/**
 * Streams the AI's thinking/reasoning as text chunks.
 * Calls onChunk for each streamed token.
 */
export async function streamThinking(
  prompt: string,
  fileTree: string,
  onChunk: (text: string) => void,
): Promise<void> {
  const groq = getGroqClient();

  const userMessage = `Repository structure:\n\`\`\`\n${fileTree || "(empty)"}\n\`\`\`\n\nTask: ${prompt}`;

  const stream = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      { role: "system", content: THINKING_PROMPT },
      { role: "user", content: userMessage },
    ],
    stream: true,
    temperature: 0.4,
    max_tokens: 200,
  });

  for await (const chunk of stream) {
    const delta = chunk.choices[0]?.delta?.content ?? "";
    if (delta) onChunk(delta);
  }
}

export async function generateCodeChanges(
  prompt: string,
  fileTree: string,
  contextFiles: { path: string; content: string }[],
): Promise<AiCodeResult> {
  const groq = getGroqClient();

  const contextSection =
    contextFiles.length > 0
      ? contextFiles
          .map((f) => `\`\`\`${f.path}\n${f.content}\n\`\`\``)
          .join("\n\n")
      : "No files provided for context.";

  const userMessage = `Repository structure:
\`\`\`
${fileTree || "(empty — create all files from scratch)"}
\`\`\`

Current file contents:
${contextSection}

Task: ${prompt}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userMessage },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
      max_tokens: 8192,
    });

    const raw = response.choices[0]?.message?.content ?? "{}";

    // Strip markdown code fences if the model wraps its output
    let content = raw.trim();
    const fenceMatch = content.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
    if (fenceMatch) content = fenceMatch[1];

    // Find the outermost JSON object as a last-resort fallback
    if (!content.startsWith("{")) {
      const start = content.indexOf("{");
      const end = content.lastIndexOf("}");
      if (start !== -1 && end !== -1) content = content.slice(start, end + 1);
    }

    logger.debug({ content }, "Raw AI response");
    const parsed = JSON.parse(content) as Partial<AiCodeResult>;

    const type = parsed.type === "chat" ? "chat" : "code";
    const reply = parsed.reply ?? parsed.summary ?? "Done";
    const summary = parsed.summary ?? reply;
    const fileChanges = (parsed.fileChanges ?? []).map((fc) => ({
      path: fc.path ?? "",
      content: fc.content ?? null,
      action: (fc.action as "create" | "modify" | "delete") ?? "modify",
    }));

    return { type, reply, summary, fileChanges };
  } catch (err) {
    logger.error({ err }, "Groq API error");
    throw new Error("AI code generation failed");
  }
}

export async function generateCommitMessage(
  diffs: { path: string; status: string }[],
  userHint?: string,
): Promise<string> {
  const groq = getGroqClient();

  const diffSummary = diffs
    .map((d) => `${d.status}: ${d.path}`)
    .join("\n");

  const prompt = userHint
    ? `Generate a concise, conventional-commits style commit message for these changes:\n${diffSummary}\nHint from user: ${userHint}`
    : `Generate a concise, conventional-commits style commit message for these changes:\n${diffSummary}`;

  try {
    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a helpful assistant that writes concise, descriptive git commit messages following conventional commits format. Return ONLY the commit message, nothing else.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 100,
    });

    return (
      response.choices[0]?.message?.content?.trim() ?? "feat: apply changes"
    );
  } catch {
    return "feat: apply AI-generated changes";
  }
}
