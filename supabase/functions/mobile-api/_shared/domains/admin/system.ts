import type { MobileApiContext } from "../../platform/auth.ts";
import type { AdminSystemContracts } from "../contracts/admin-system.ts";
import { requireAdminCapability } from "./actor.ts";
import {
  getSystemPriceBaseline,
  listSystemEvidencePackages,
  listSystemPriceBaselines,
  publishSystemPriceBaseline,
  retireSystemPriceBaseline,
  validateSystemPriceBaseline,
} from "./system-price.ts";
import { getSystemTaxonomy, listSystemTaxonomy, updateSystemTaxonomy, validateSystemTaxonomy } from "./system-taxonomy.ts";
import { applySystemLearningAction, getSystemLearningRule, listSystemLearningRules, previewSystemLearningAction } from "./system-learning.ts";
import { getSystemModelHealthDetail, listSystemModelHealth } from "./system-model-health.ts";

export async function listAdminSystemPriceBaselines(ctx: MobileApiContext, input: AdminSystemContracts["priceListInput"]) {
  await requireAdminCapability(ctx, "system.read");
  return listSystemPriceBaselines(ctx, input);
}

export async function getAdminSystemPriceBaseline(ctx: MobileApiContext, baselineId: string) {
  const actor = await requireAdminCapability(ctx, "system.read");
  return withPermission(await getSystemPriceBaseline(ctx, baselineId), actor.capabilities.includes("system.manage"));
}

export async function listAdminSystemEvidencePackages(ctx: MobileApiContext, input: AdminSystemContracts["priceListInput"]) {
  await requireAdminCapability(ctx, "system.manage");
  return listSystemEvidencePackages(ctx, input);
}

export async function validateAdminSystemPriceBaseline(ctx: MobileApiContext, input: AdminSystemContracts["priceMutationInput"]) {
  await requireAdminCapability(ctx, "system.manage");
  return validateSystemPriceBaseline(ctx, input);
}

export async function publishAdminSystemPriceBaseline(ctx: MobileApiContext, input: AdminSystemContracts["priceMutationInput"]) {
  await requireAdminCapability(ctx, "system.manage");
  return publishSystemPriceBaseline(ctx, input);
}

export async function retireAdminSystemPriceBaseline(ctx: MobileApiContext, baselineId: string, input: AdminSystemContracts["mutationInput"]) {
  await requireAdminCapability(ctx, "system.manage");
  return retireSystemPriceBaseline(ctx, baselineId, input);
}

export async function listAdminSystemTaxonomy(ctx: MobileApiContext, input: AdminSystemContracts["taxonomyListInput"]) {
  await requireAdminCapability(ctx, "system.read");
  return listSystemTaxonomy(ctx, input);
}

export async function getAdminSystemTaxonomy(ctx: MobileApiContext, serviceType: string) {
  const actor = await requireAdminCapability(ctx, "system.read");
  return withPermission(await getSystemTaxonomy(ctx, serviceType), actor.capabilities.includes("system.manage"));
}

export async function validateAdminSystemTaxonomy(ctx: MobileApiContext, serviceType: string, input: AdminSystemContracts["taxonomyMutationInput"]) {
  await requireAdminCapability(ctx, "system.manage");
  return validateSystemTaxonomy(ctx, serviceType, input);
}

export async function updateAdminSystemTaxonomy(ctx: MobileApiContext, serviceType: string, input: AdminSystemContracts["taxonomyMutationInput"]) {
  await requireAdminCapability(ctx, "system.manage");
  return updateSystemTaxonomy(ctx, serviceType, input);
}

export async function listAdminSystemLearningRules(ctx: MobileApiContext, input: AdminSystemContracts["learningListInput"]) {
  await requireAdminCapability(ctx, "system.read");
  return listSystemLearningRules(ctx, input);
}

export async function getAdminSystemLearningRule(ctx: MobileApiContext, ruleId: string) {
  const actor = await requireAdminCapability(ctx, "system.read");
  return withPermission(await getSystemLearningRule(ctx, ruleId), actor.capabilities.includes("system.manage"));
}

export async function previewAdminSystemLearningAction(ctx: MobileApiContext, ruleId: string, action: "rollback" | "revoke", input: AdminSystemContracts["learningActionInput"]) {
  await requireAdminCapability(ctx, "system.manage");
  return previewSystemLearningAction(ctx, ruleId, action, input);
}

export async function applyAdminSystemLearningAction(ctx: MobileApiContext, ruleId: string, action: "rollback" | "revoke", input: AdminSystemContracts["learningActionInput"]) {
  await requireAdminCapability(ctx, "system.manage");
  return applySystemLearningAction(ctx, ruleId, action, input);
}

export async function listAdminSystemModelHealth(ctx: MobileApiContext, input: AdminSystemContracts["modelHealthInput"]) {
  await requireAdminCapability(ctx, "system.read");
  return listSystemModelHealth(ctx, input);
}

export async function getAdminSystemModelHealthDetail(ctx: MobileApiContext, detailKey: string) {
  await requireAdminCapability(ctx, "system.read");
  return getSystemModelHealthDetail(ctx, detailKey);
}

function withPermission<T extends { permission: "read" | "manage"; available_actions: string[] }>(response: T, canManage: boolean): T {
  return { ...response, permission: canManage ? "manage" : "read", available_actions: canManage ? response.available_actions : [] };
}
