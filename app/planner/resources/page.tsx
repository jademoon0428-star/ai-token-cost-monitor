import {
  listAiRegistry,
  listUserAiTools,
} from "@/lib/registry/ai-registry-repository";
import { AiResources } from "@/components/planner/ai-resources";

/*
 * R3.2 AI Resources page.
 *
 * This page manages registered AI resources. The resources themselves
 * are always read and written through the R3.1 Planner Resource API,
 * so this file never reaches ai_resources directly.
 *
 * The only data prepared here is the lookup lists for the form and
 * for the cards: the user's registered tools and the registry's
 * providers and models. Both come from existing registry repository
 * reads, because there is no read-only Registry API in this app yet
 * and R3.2 must not invent a new one for a dropdown.
 *
 * force-dynamic keeps this page out of static generation: the build
 * must not open the real database, and at request time the tool and
 * model lists are read fresh from whatever the registry currently
 * contains.
 */
export const dynamic = "force-dynamic";

export default function PlannerResourcesPage() {
  const tools = listUserAiTools();
  const providers = listAiRegistry();

  return (
    <AiResources
      tools={tools.map((tool) => ({
        id: tool.id,
        name: tool.name,
        category: tool.category,
        status: tool.status,
      }))}
      providers={providers.map((provider) => ({
        id: provider.id,
        name: provider.name,
        models: provider.models.map((model) => ({
          id: model.id,
          name: model.name,
        })),
      }))}
    />
  );
}