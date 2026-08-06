/**
 * E2E verification helper: drives the real OAuth 2.1 dance (dynamic client registration ->
 * sign in -> PKCE authorize -> consent -> token exchange) against a *running* instance of this app,
 * then publishes a handful of artifacts through the real /mcp endpoint - exactly what an MCP client
 * (e.g. claude.ai) would do. The OAuth dance itself lives in testing/oauth-client.ts, shared with
 * src/lib/mcp/oauth-flow.int.test.ts, which drives it in-process; this script runs it over real
 * HTTP against BASE_URL.
 *
 * Not part of the app itself - a throwaway dev/verification tool. Run with:
 *   BASE_URL=http://127.0.0.1:PORT OWNER_EMAIL=... OWNER_PASSWORD=... node scripts/dev-publish.ts
 *
 * Prints a JSON summary of the published artifacts (id/title/version) to stdout.
 */
import { comparisonFixture } from '../src/catalog/fixtures/comparison.ts';
import { explainerFixture } from '../src/catalog/fixtures/explainer.ts';
import { flowFixture } from '../src/catalog/fixtures/flow.ts';
import { itineraryFixture } from '../src/catalog/fixtures/itinerary.ts';
import { kitchenSinkFixture } from '../src/catalog/fixtures/kitchen-sink.ts';
import { getAccessToken } from '../testing/oauth-client.ts';
import { decisionMemoExample } from './examples/decision-memo.ts';
import { markdownNotesExample } from './examples/markdown-notes.ts';
import { researchSummaryExample } from './examples/research-summary.ts';
import { roadTripExample } from './examples/road-trip.ts';
import { statusReportExample } from './examples/status-report.ts';

function requireEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    console.error(`${name} environment variable is required`);
    process.exit(1);
  }

  return value;
}

const baseURL = requireEnv('BASE_URL');
const email = requireEnv('OWNER_EMAIL');
const password = requireEnv('OWNER_PASSWORD');

interface JsonRpcResponse {
  result?: {
    isError?: boolean;
    structuredContent?: Record<string, unknown>;
  };
  error?: unknown;
}

async function mcpCall(accessToken: string, body: unknown): Promise<JsonRpcResponse> {
  const response = await fetch(`${baseURL}/mcp`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json, text/event-stream',
      authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();
  const json = (rawText ? JSON.parse(rawText) : {}) as JsonRpcResponse;

  if (!response.ok) {
    throw new Error(`/mcp call failed: ${response.status} ${rawText}`);
  }

  if (json.result?.isError) {
    throw new Error(`/mcp tool call errored: ${JSON.stringify(json.result)}`);
  }

  return json;
}

let toolCallId = 0;

async function callTool(
  accessToken: string,
  name: string,
  args: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  toolCallId += 1;

  const result = await mcpCall(accessToken, {
    jsonrpc: '2.0',
    id: toolCallId,
    method: 'tools/call',
    params: { name, arguments: args },
  });

  return result.result?.structuredContent ?? {};
}

const sandboxCheckHtml = `<!doctype html>
<html>
  <head><title>Sandbox Check</title></head>
  <body>
    <h1 id="heading">Sandbox check page</h1>
    <p id="output">running…</p>
    <script>
      const results = {};
      try {
        results.cookie = JSON.stringify(document.cookie);
      } catch (error) {
        results.cookie = 'threw: ' + error.message;
      }
      try {
        window.localStorage.setItem('x', '1');
        results.localStorage = 'succeeded (no throw)';
      } catch (error) {
        results.localStorage = 'threw: ' + error.message;
      }
      try {
        void window.parent.document;
        results.parentDocument = 'succeeded (no throw)';
      } catch (error) {
        results.parentDocument = 'threw: ' + error.message;
      }
      document.getElementById('output').textContent = JSON.stringify(results);
      window.__sandboxResults = results;
    </script>
  </body>
</html>`;

async function main() {
  const accessToken = await getAccessToken({
    baseURL,
    email,
    password,
    redirectUri: 'https://claude.ai/api/mcp/auth_callback',
    clientName: 'exhibit-dev-publish',
  });

  const itinerary = await callTool(accessToken, 'publish_spec', {
    title: 'Kyoto Itinerary',
    description: 'A three-day Kyoto trip, published for Phase 5 E2E verification.',
    tags: ['travel', 'demo'],
    spec: itineraryFixture,
  });

  const updated = await callTool(accessToken, 'update_artifact', {
    id: itinerary.id,
    title: 'Kyoto Itinerary (v2)',
    spec: itineraryFixture,
  });

  const explainer = await callTool(accessToken, 'publish_spec', {
    title: 'OAuth Device Flow Explainer',
    description: 'A plain-language explainer, published for Phase 5 E2E verification.',
    tags: ['docs', 'demo'],
    spec: explainerFixture,
  });

  const comparison = await callTool(accessToken, 'publish_spec', {
    title: 'Plan Comparison',
    description: 'Three pricing plans compared side by side with feature and cost breakdowns.',
    tags: ['docs', 'demo'],
    spec: comparisonFixture,
  });

  const kitchenSink = await callTool(accessToken, 'publish_spec', {
    title: 'Kitchen Sink Replacement',
    description: 'A home-repair project brief exercising every catalog component.',
    tags: ['demo', 'kitchen-sink'],
    spec: kitchenSinkFixture,
  });

  const researchSummary = await callTool(accessToken, 'publish_spec', {
    title: researchSummaryExample.title,
    description: researchSummaryExample.description,
    tags: researchSummaryExample.tags,
    spec: researchSummaryExample.spec,
  });

  const decisionMemo = await callTool(accessToken, 'publish_spec', {
    title: decisionMemoExample.title,
    description: decisionMemoExample.description,
    tags: decisionMemoExample.tags,
    spec: decisionMemoExample.spec,
  });

  const statusReport = await callTool(accessToken, 'publish_spec', {
    title: statusReportExample.title,
    description: statusReportExample.description,
    tags: statusReportExample.tags,
    spec: statusReportExample.spec,
  });

  const roadTrip = await callTool(accessToken, 'publish_spec', {
    title: roadTripExample.title,
    description: roadTripExample.description,
    tags: roadTripExample.tags,
    spec: roadTripExample.spec,
  });

  const flow = await callTool(accessToken, 'publish_spec', {
    title: 'Flow Stress Test',
    description: 'Every block seam in sequence — the prose-flow margin rhythm stress test.',
    tags: ['demo', 'flow'],
    spec: flowFixture,
  });

  const markdownNotes = await callTool(accessToken, 'publish_markdown', {
    title: markdownNotesExample.title,
    description: markdownNotesExample.description,
    tags: markdownNotesExample.tags,
    markdown: markdownNotesExample.markdown,
  });

  const htmlArtifact = await callTool(accessToken, 'publish_html', {
    title: 'Sandbox Check Page',
    description: 'Inline JS that probes cookie/localStorage/parent access from the iframe sandbox.',
    tags: ['demo'],
    html: sandboxCheckHtml,
  });

  console.log(
    JSON.stringify(
      {
        itinerary: { id: itinerary.id, title: 'Kyoto Itinerary', latestVersion: updated.version },
        explainer: { id: explainer.id, title: 'OAuth Device Flow Explainer' },
        comparison: { id: comparison.id, title: 'Plan Comparison' },
        kitchenSink: { id: kitchenSink.id, title: 'Kitchen Sink Replacement' },
        researchSummary: { id: researchSummary.id, title: researchSummaryExample.title },
        decisionMemo: { id: decisionMemo.id, title: decisionMemoExample.title },
        statusReport: { id: statusReport.id, title: statusReportExample.title },
        roadTrip: { id: roadTrip.id, title: roadTripExample.title },
        flow: { id: flow.id, title: 'Flow Stress Test' },
        markdownNotes: { id: markdownNotes.id, title: markdownNotesExample.title },
        html: { id: htmlArtifact.id, title: 'Sandbox Check Page', version: htmlArtifact.version },
      },
      null,
      2,
    ),
  );
}

await main();
