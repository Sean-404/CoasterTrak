/**
 * Apply placeholder-park relink plans against Supabase (service role / sync client).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  mergeCoasterFields,
  type RelinkCoaster,
  type RelinkPlan,
} from "@/lib/relink-placeholder-parks";

async function remapRideEvents(
  supabase: SupabaseClient,
  fromId: number,
  toId: number,
): Promise<void> {
  const { data, error } = await supabase
    .from("ride_events")
    .select("id, user_id, ridden_on, quantity")
    .eq("coaster_id", fromId);
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return;
    throw new Error(`ride_events load ${fromId}->${toId}: ${error.message}`);
  }

  for (const event of data ?? []) {
    const { error: updateError } = await supabase
      .from("ride_events")
      .update({ coaster_id: toId })
      .eq("id", event.id);
    if (!updateError) continue;
    if (!/duplicate|unique/i.test(updateError.message)) {
      throw new Error(`ride_events remap ${fromId}->${toId}: ${updateError.message}`);
    }

    let query = supabase
      .from("ride_events")
      .select("id, quantity")
      .eq("user_id", event.user_id)
      .eq("coaster_id", toId)
      .neq("id", event.id);
    query = event.ridden_on == null ? query.is("ridden_on", null) : query.eq("ridden_on", event.ridden_on);
    const { data: existing, error: existingError } = await query.maybeSingle();
    if (existingError) {
      throw new Error(`ride_events merge lookup ${fromId}->${toId}: ${existingError.message}`);
    }
    if (!existing) {
      throw new Error(
        `ride_events merge ${fromId}->${toId}: unique conflict but no target row for user ${event.user_id}`,
      );
    }
    const { error: addError } = await supabase
      .from("ride_events")
      .update({ quantity: Math.min(99, Number(existing.quantity) + Number(event.quantity)) })
      .eq("id", existing.id);
    if (addError) throw new Error(`ride_events merge ${fromId}->${toId}: ${addError.message}`);
    const { error: deleteError } = await supabase.from("ride_events").delete().eq("id", event.id);
    if (deleteError) throw new Error(`ride_events drop ${fromId}->${toId}: ${deleteError.message}`);
  }
}

async function remapUserRefs(
  supabase: SupabaseClient,
  fromId: number,
  toId: number,
): Promise<void> {
  await remapRideEvents(supabase, fromId, toId);
  for (const table of ["rides", "wishlist"] as const) {
    const { error } = await supabase.from(table).update({ coaster_id: toId }).eq("coaster_id", fromId);
    if (error) throw new Error(`${table} remap ${fromId}->${toId}: ${error.message}`);
  }
  const { error: favErr } = await supabase
    .from("profiles")
    .update({ favorite_ride_id: toId })
    .eq("favorite_ride_id", fromId);
  if (favErr) throw new Error(`profiles favorite remap: ${favErr.message}`);

  for (const table of [
    "data_coaster_source_links",
    "data_coaster_field_overrides",
    "data_review_findings",
  ] as const) {
    const { error } = await supabase.from(table).update({ coaster_id: toId }).eq("coaster_id", fromId);
    if (error && !/does not exist|schema cache/i.test(error.message)) {
      throw new Error(`${table} remap ${fromId}->${toId}: ${error.message}`);
    }
  }
}

export async function applyPlaceholderRelinkPlans(
  supabase: SupabaseClient,
  plans: RelinkPlan[],
  coastersById: Map<number, RelinkCoaster>,
): Promise<{ applied: number; failed: number }> {
  let applied = 0;
  let failed = 0;

  for (const plan of plans) {
    if (plan.action === "skip") continue;
    try {
      if (plan.action === "move") {
        const { error } = await supabase
          .from("coasters")
          .update({ park_id: plan.toParkId, last_synced_at: new Date().toISOString() })
          .eq("id", plan.coasterId);
        if (error) throw new Error(error.message);
      } else {
        const keep = coastersById.get(plan.keepId);
        const drop = coastersById.get(plan.dropId);
        if (!keep || !drop) throw new Error(`missing rows keep=${plan.keepId} drop=${plan.dropId}`);

        // Remap + delete the twin first so (park_id, name) is free for the keep row.
        await remapUserRefs(supabase, plan.dropId, plan.keepId);
        const { error: delErr } = await supabase.from("coasters").delete().eq("id", plan.dropId);
        if (delErr) throw new Error(delErr.message);

        const fields = mergeCoasterFields(keep, drop);
        const { error: upErr } = await supabase
          .from("coasters")
          .update({
            ...fields,
            park_id: plan.toParkId,
            name: keep.name || drop.name,
            last_synced_at: new Date().toISOString(),
          })
          .eq("id", plan.keepId);
        if (upErr) throw new Error(upErr.message);
      }
      applied++;
    } catch (e) {
      failed++;
      let label = "plan";
      if (plan.action === "merge") {
        label = `merge keep=#${plan.keepId} drop=#${plan.dropId} ${plan.coasterName}`;
      } else if (plan.action === "move") {
        label = `move #${plan.coasterId} ${plan.coasterName}`;
      }
      console.error(`  FAIL ${label}: ${e instanceof Error ? e.message : e}`);
    }
  }

  return { applied, failed };
}
