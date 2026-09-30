import type { ComplaintCategory, Hotspot } from "@civicpulse/shared";
import { logger } from "../utils/logger.js";

type HotspotInput = Omit<Hotspot, "recommendation">;

const projectTypes: Record<ComplaintCategory, string> = {
  roads: "targeted road rehabilitation and drainage upgrades",
  water: "a water-network repair and leak-reduction program",
  electricity: "a distribution-grid reliability and transformer upgrade",
  sanitation: "a neighborhood waste collection and sewer maintenance program",
  healthcare: "a primary-care clinic capacity and essential-medicines project",
  internet: "a last-mile broadband and public-connectivity expansion",
  drainage: "a storm-drain and flood-prevention overhaul",
  education: "a school modernization and capacity-building initiative",
  transport: "a transit-routing and mobility-safety project",
  safety: "a community-safety lighting and policing initiative",
  other: "a generalized community infrastructure improvement program",
};

function defaultRecommendation(hotspot: HotspotInput): string {
  const reason =
    `${hotspot.complaintCount} reports average severity ${hotspot.avgSeverity.toFixed(1)} ` +
    `and a priority score of ${hotspot.priorityScore.toFixed(1)}.`;
  return `Prioritize ${projectTypes[hotspot.topCategory]}. ${reason}`;
}

// Makes one Gemini request for the entire top-K list, with an 8-second abort and deterministic fallback.
export async function recommendHotspots(hotspots: HotspotInput[]): Promise<Hotspot[]> {
  if (hotspots.length === 0) return [];
  const fallback = new Map(
    hotspots.map((hotspot) => [hotspot.districtId, defaultRecommendation(hotspot)]),
  );
  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    return hotspots.map((hotspot) => ({
      ...hotspot,
      recommendation: fallback.get(hotspot.districtId)!,
    }));
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `For each supplied district, return exactly one concise policymaker recommendation of 1-2 sentences. Name a concrete suggested infrastructure project type and a rough priority reason grounded in complaint count, average severity, and priority score. Return every districtId exactly once. Data: ${JSON.stringify(hotspots)}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                recommendations: {
                  type: "ARRAY",
                  items: {
                    type: "OBJECT",
                    properties: {
                      districtId: { type: "STRING" },
                      recommendation: { type: "STRING" },
                    },
                    required: ["districtId", "recommendation"],
                  },
                },
              },
              required: ["recommendations"],
            },
          },
        }),
        signal: controller.signal,
      },
    );
    if (!response.ok) throw new Error(`Gemini recommendations returned HTTP ${response.status}`);
    const payload: unknown = await response.json();
    const content = (
      payload as {
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
      }
    ).candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error("Gemini returned no recommendations");
    const parsed: unknown = JSON.parse(content);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !Array.isArray((parsed as { recommendations?: unknown }).recommendations)
    ) {
      throw new Error("Gemini recommendation response is invalid");
    }
    const generated = new Map<string, string>();
    for (const item of (parsed as { recommendations: unknown[] }).recommendations) {
      if (typeof item !== "object" || item === null) continue;
      const record = item as Record<string, unknown>;
      if (typeof record.districtId !== "string" || typeof record.recommendation !== "string") {
        continue;
      }
      const districtId = record.districtId;
      const recommendation = record.recommendation.trim();
      if (fallback.has(districtId) && recommendation.length > 0) {
        generated.set(districtId, recommendation.slice(0, 600));
      }
    }
    return hotspots.map((hotspot) => ({
      ...hotspot,
      recommendation: generated.get(hotspot.districtId) ?? fallback.get(hotspot.districtId)!,
    }));
  } catch (error) {
    logger.error(
      "Batched hotspot recommendations failed; using deterministic recommendations",
      error,
    );
    return hotspots.map((hotspot) => ({
      ...hotspot,
      recommendation: fallback.get(hotspot.districtId)!,
    }));
  } finally {
    clearTimeout(timer);
  }
}
