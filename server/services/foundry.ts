import { randomUUID } from "node:crypto";
import { DefaultAzureCredential, ManagedIdentityCredential } from "@azure/identity";
import { AIProjectClient } from "@azure/ai-projects";

interface ChatSession {
  conversationId: string;
  updatedAt: number;
}

export interface SourceCitation {
  title: string;
  url?: string;
}

const sessions = new Map<string, ChatSession>();
let projectClient: AIProjectClient | undefined;

function getCredential() {
  return process.env.NODE_ENV === "production"
    ? new ManagedIdentityCredential()
    : new DefaultAzureCredential();
}

export function isFoundryConfigured(): boolean {
  return Boolean(
    process.env.FOUNDRY_PROJECT_ENDPOINT?.trim() &&
    process.env.FOUNDRY_AGENT_NAME?.trim(),
  );
}

function getProjectClient(): AIProjectClient {
  const endpoint = process.env.FOUNDRY_PROJECT_ENDPOINT?.trim();
  if (!endpoint) {
    throw new Error("Falta FOUNDRY_PROJECT_ENDPOINT.");
  }
  projectClient ??= new AIProjectClient(endpoint, getCredential());
  return projectClient;
}

export async function askFoundry(message: string, sessionId?: string): Promise<{ answer: string; sessionId: string; sources: SourceCitation[] }> {
  const agentName = process.env.FOUNDRY_AGENT_NAME?.trim();
  if (!agentName) {
    throw new Error("Falta FOUNDRY_AGENT_NAME.");
  }

  const client = getProjectClient();
  const openAI = client.getOpenAIClient();
  const publicSessionId = sessionId && sessions.has(sessionId) ? sessionId : randomUUID();
  let session = sessions.get(publicSessionId);

  if (!session) {
    const conversation = await openAI.conversations.create();
    session = { conversationId: conversation.id, updatedAt: Date.now() };
    sessions.set(publicSessionId, session);
  }

  const response = await openAI.responses.create(
    { conversation: session.conversationId, input: message },
    { body: { agent_reference: { name: agentName, type: "agent_reference" } } },
  );
  session.updatedAt = Date.now();

  const sourceMap = new Map<string, SourceCitation>();
  for (const item of response.output) {
    if (item.type !== "message") continue;
    for (const content of item.content) {
      if (content.type !== "output_text") continue;
      for (const annotation of content.annotations) {
        if (annotation.type === "file_citation") {
          sourceMap.set(annotation.file_id, { title: annotation.filename });
        } else if (annotation.type === "url_citation" && annotation.url.startsWith("https://")) {
          sourceMap.set(annotation.url, { title: annotation.title, url: annotation.url });
        }
      }
    }
  }

  if (sessions.size > 200) {
    const oldest = [...sessions.entries()].sort((left, right) => left[1].updatedAt - right[1].updatedAt)[0];
    if (oldest) sessions.delete(oldest[0]);
  }

  return { answer: response.output_text, sessionId: publicSessionId, sources: [...sourceMap.values()] };
}
