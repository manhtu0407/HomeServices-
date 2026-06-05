export const KAEL_PURPOSES = [
  'intent_classification',
  'vision_analysis',
  'clarification',
  'problem_synthesis',
  'market_lookup',
  'price_synthesis',
  'advisory_generation',
  'worker_brief',
  'worker_assist',
  'scope_change',
  'post_job_learning',
  'educational_response',
] as const

export type KaelPurpose = (typeof KAEL_PURPOSES)[number]

export const KAEL_ACTIONS = [
  'read_context',
  'classify_intent',
  'analyze_media',
  'ask_clarification',
  'synthesize_problem',
  'lookup_market',
  'synthesize_price',
  'generate_advisory',
  'generate_worker_brief',
  'review_scope_change',
  'write_memory',
  'read_memory',
  'create_learning_candidate',
  'decline_response',
] as const

export type KaelAction = (typeof KAEL_ACTIONS)[number]

export const KAEL_ALLOWED_TOPICS = [
  'electrical_repair',
  'plumbing_repair',
  'home_cleaning',
  'electrical_safety_education',
  'plumbing_self_diagnosis',
  'cleaning_best_practices',
  'service_pricing_general_info',
  'worker_qualification_explain',
  'price_estimate',
  'worker_brief',
  'scope_change',
  'job_status',
  'app_usage_help',
  'safety_advisory',
  'worker_safety_advisory',
  'legal_safety_awareness',
  'support_redirect',
] as const

export const KAEL_FORBIDDEN_TOPICS = [
  'medical_advice',
  'legal_advice',
  'financial_advice',
  'other_workers_specific',
  'other_jobs_specific',
  'market_prediction',
  'political_opinion',
  'social_opinion',
  'exact_guaranteed_price',
  'fear_based_upsell',
  'out_of_scope_services_anything',
] as const

export const KAEL_TOPICS = [
  ...KAEL_ALLOWED_TOPICS,
  ...KAEL_FORBIDDEN_TOPICS,
] as const

export type KaelTopic = (typeof KAEL_TOPICS)[number]

export const KAEL_ACTOR_ROLES = ['customer', 'worker', 'admin', 'system'] as const
export type KaelActorRole = (typeof KAEL_ACTOR_ROLES)[number]

export const KAEL_JOB_RELATIONS = [
  'none',
  'own_customer_job',
  'own_worker_job',
  'admin_review',
] as const

export type KaelJobRelation = (typeof KAEL_JOB_RELATIONS)[number]

export type KaelPermissionDecision = 'allow' | 'deny' | 'rate_limit' | 'escalate'

export type KaelAuditLevel = 'none' | 'decision' | 'full'

export type DeclineTemplateKey =
  | 'out_of_scope_service'
  | 'out_of_domain_question'
  | 'cannot_do_action'
  | 'unsafe_or_sensitive'
  | 'rate_limit_hit'
  | 'cost_cap_hit'
  | 'legal_advice_redirect'
  | 'emergency_redirect'

export type PermissionRule = {
  purpose: KaelPurpose
  actor: KaelActorRole
  jobRelation: KaelJobRelation
  decision: KaelPermissionDecision
  allowedActions: readonly KaelAction[]
  allowedTopics: readonly KaelTopic[]
  deniedTopics: readonly KaelTopic[]
  auditLevel: KaelAuditLevel
  reasonCode: string
  declineTemplateKey?: DeclineTemplateKey
}

export type KaelPermissionRequest = {
  purpose: KaelPurpose
  actor: KaelActorRole
  jobRelation: KaelJobRelation
  action: KaelAction
  topic: KaelTopic
}

export type KaelPermissionResolution = PermissionRule & {
  requestedAction: KaelAction
  requestedTopic: KaelTopic
}

export const KAEL_PERMISSION_MATRIX_VERSION = '2026-05-25.p5'

const ALL_ALLOWED_TOPICS = KAEL_ALLOWED_TOPICS
const ALL_FORBIDDEN_TOPICS = KAEL_FORBIDDEN_TOPICS
const SERVICE_TOPICS = ['electrical_repair', 'plumbing_repair', 'home_cleaning'] as const
const EDUCATIONAL_TOPICS = [
  'electrical_safety_education',
  'plumbing_self_diagnosis',
  'cleaning_best_practices',
  'service_pricing_general_info',
  'worker_qualification_explain',
  'legal_safety_awareness',
] as const
const FUNCTIONAL_TOPICS = [
  'price_estimate',
  'worker_brief',
  'scope_change',
  'job_status',
  'app_usage_help',
  'safety_advisory',
] as const

const ACTIONS_BY_PURPOSE: Record<KaelPurpose, readonly KaelAction[]> = {
  intent_classification: ['classify_intent'],
  vision_analysis: ['analyze_media'],
  clarification: ['ask_clarification'],
  problem_synthesis: ['synthesize_problem'],
  market_lookup: ['lookup_market'],
  price_synthesis: ['synthesize_price'],
  advisory_generation: ['generate_advisory'],
  worker_brief: ['generate_worker_brief'],
  worker_assist: ['read_context', 'generate_advisory', 'ask_clarification'],
  scope_change: ['review_scope_change'],
  post_job_learning: ['write_memory', 'create_learning_candidate'],
  educational_response: ['generate_advisory', 'read_context'],
}

const TOPICS_BY_PURPOSE: Record<KaelPurpose, readonly KaelTopic[]> = {
  intent_classification: [...SERVICE_TOPICS, 'app_usage_help'],
  vision_analysis: SERVICE_TOPICS,
  clarification: [...SERVICE_TOPICS, ...FUNCTIONAL_TOPICS, 'support_redirect'],
  problem_synthesis: SERVICE_TOPICS,
  market_lookup: ['service_pricing_general_info', 'price_estimate'],
  price_synthesis: ['price_estimate', 'service_pricing_general_info'],
  advisory_generation: ['safety_advisory', 'worker_safety_advisory', 'legal_safety_awareness'],
  worker_brief: ['worker_brief', 'job_status', 'safety_advisory'],
  worker_assist: ['worker_brief', 'job_status', 'safety_advisory', 'worker_safety_advisory', 'scope_change', 'app_usage_help'],
  scope_change: ['scope_change', 'safety_advisory'],
  post_job_learning: [...SERVICE_TOPICS, 'scope_change', 'worker_safety_advisory'],
  educational_response: [...SERVICE_TOPICS, ...EDUCATIONAL_TOPICS, 'worker_safety_advisory', 'support_redirect'],
}

export const KAEL_PERMISSION_RULES: readonly PermissionRule[] = KAEL_PURPOSES.flatMap((purpose) =>
  KAEL_ACTOR_ROLES.flatMap((actor) =>
    KAEL_JOB_RELATIONS.map((jobRelation) => buildRule(purpose, actor, jobRelation))
  )
)

export function resolveKaelPermission(request: KaelPermissionRequest): KaelPermissionResolution {
  if (
    request.actor === 'worker' &&
    request.jobRelation === 'none' &&
    (request.purpose === 'worker_brief' || request.topic === 'other_jobs_specific')
  ) {
    return denyFromRequest(request, 'DENY_WORKER_PRE_ACCEPT_PII', 'cannot_do_action')
  }

  const forbidden = forbiddenTopicDecision(request.topic)
  if (forbidden) return denyFromRequest(request, forbidden.reasonCode, forbidden.template)

  const rule = KAEL_PERMISSION_RULES.find((candidate) =>
    candidate.purpose === request.purpose &&
    candidate.actor === request.actor &&
    candidate.jobRelation === request.jobRelation
  )

  if (!rule) return denyFromRequest(request, 'DENY_PERMISSION_RULE_MISSING', 'out_of_domain_question')
  if (rule.decision !== 'allow') {
    return {
      ...rule,
      requestedAction: request.action,
      requestedTopic: request.topic,
    }
  }
  if (!rule.allowedActions.includes(request.action)) {
    return denyFromRequest(request, 'DENY_ACTION_NOT_ALLOWED', 'cannot_do_action')
  }
  if (!rule.allowedTopics.includes(request.topic)) {
    return denyFromRequest(request, 'DENY_TOPIC_NOT_ALLOWED', 'out_of_domain_question')
  }
  return {
    ...rule,
    requestedAction: request.action,
    requestedTopic: request.topic,
  }
}

function buildRule(
  purpose: KaelPurpose,
  actor: KaelActorRole,
  jobRelation: KaelJobRelation,
): PermissionRule {
  if (actor === 'admin') {
    return allowRule(purpose, actor, jobRelation, ALL_ALLOWED_TOPICS, 'ALLOW_ADMIN')
  }
  if (actor === 'system') {
    return purpose === 'post_job_learning'
      ? allowRule(purpose, actor, jobRelation, TOPICS_BY_PURPOSE[purpose], 'ALLOW_SYSTEM_LEARNING')
      : denyRule(purpose, actor, jobRelation, 'DENY_SYSTEM_PURPOSE', 'cannot_do_action')
  }
  if (purpose === 'educational_response') {
    return allowRule(purpose, actor, jobRelation, TOPICS_BY_PURPOSE[purpose], 'ALLOW_EDUCATIONAL_RESPONSE')
  }
  if (actor === 'customer') {
    return customerRule(purpose, actor, jobRelation)
  }
  return workerRule(purpose, actor, jobRelation)
}

function customerRule(
  purpose: KaelPurpose,
  actor: KaelActorRole,
  jobRelation: KaelJobRelation,
) {
  if (purpose === 'post_job_learning' || purpose === 'worker_brief' || purpose === 'worker_assist') {
    return denyRule(purpose, actor, jobRelation, 'DENY_CUSTOMER_PURPOSE', 'cannot_do_action')
  }
  if (
    ['price_synthesis', 'market_lookup', 'scope_change', 'vision_analysis', 'problem_synthesis'].includes(purpose) &&
    jobRelation !== 'own_customer_job'
  ) {
    return denyRule(purpose, actor, jobRelation, 'DENY_CUSTOMER_JOB_REQUIRED', 'cannot_do_action')
  }
  return allowRule(purpose, actor, jobRelation, TOPICS_BY_PURPOSE[purpose], `ALLOW_${purpose.toUpperCase()}`)
}

function workerRule(
  purpose: KaelPurpose,
  actor: KaelActorRole,
  jobRelation: KaelJobRelation,
) {
  if (purpose === 'worker_brief') {
    return jobRelation === 'own_worker_job'
      ? allowRule(purpose, actor, jobRelation, TOPICS_BY_PURPOSE[purpose], 'ALLOW_WORKER_BRIEF')
      : denyRule(purpose, actor, jobRelation, 'DENY_WORKER_PRE_ACCEPT_PII', 'cannot_do_action')
  }
  if (purpose === 'worker_assist') {
    return jobRelation === 'own_worker_job'
      ? allowRule(purpose, actor, jobRelation, TOPICS_BY_PURPOSE[purpose], 'ALLOW_WORKER_ASSIST')
      : denyRule(purpose, actor, jobRelation, 'DENY_WORKER_JOB_REQUIRED', 'cannot_do_action')
  }
  if (purpose === 'scope_change') {
    return jobRelation === 'own_worker_job'
      ? allowRule(purpose, actor, jobRelation, TOPICS_BY_PURPOSE[purpose], 'ALLOW_WORKER_SCOPE_CHANGE')
      : denyRule(purpose, actor, jobRelation, 'DENY_WORKER_JOB_REQUIRED', 'cannot_do_action')
  }
  if (purpose === 'advisory_generation' || purpose === 'clarification') {
    return jobRelation === 'own_worker_job'
      ? allowRule(purpose, actor, jobRelation, TOPICS_BY_PURPOSE[purpose], `ALLOW_${purpose.toUpperCase()}`)
      : denyRule(purpose, actor, jobRelation, 'DENY_WORKER_JOB_REQUIRED', 'cannot_do_action')
  }
  return denyRule(purpose, actor, jobRelation, 'DENY_WORKER_PURPOSE', 'cannot_do_action')
}

function allowRule(
  purpose: KaelPurpose,
  actor: KaelActorRole,
  jobRelation: KaelJobRelation,
  allowedTopics: readonly KaelTopic[],
  reasonCode: string,
): PermissionRule {
  return {
    purpose,
    actor,
    jobRelation,
    decision: 'allow',
    allowedActions: ACTIONS_BY_PURPOSE[purpose],
    allowedTopics,
    deniedTopics: ALL_FORBIDDEN_TOPICS,
    auditLevel: 'decision',
    reasonCode,
  }
}

function denyRule(
  purpose: KaelPurpose,
  actor: KaelActorRole,
  jobRelation: KaelJobRelation,
  reasonCode: string,
  declineTemplateKey: DeclineTemplateKey,
): PermissionRule {
  return {
    purpose,
    actor,
    jobRelation,
    decision: 'deny',
    allowedActions: [],
    allowedTopics: [],
    deniedTopics: ALL_FORBIDDEN_TOPICS,
    auditLevel: 'decision',
    reasonCode,
    declineTemplateKey,
  }
}

function denyFromRequest(
  request: KaelPermissionRequest,
  reasonCode: string,
  declineTemplateKey: DeclineTemplateKey,
): KaelPermissionResolution {
  return {
    ...denyRule(request.purpose, request.actor, request.jobRelation, reasonCode, declineTemplateKey),
    requestedAction: request.action,
    requestedTopic: request.topic,
  }
}

function forbiddenTopicDecision(topic: KaelTopic): {
  reasonCode: string
  template: DeclineTemplateKey
} | null {
  if (topic === 'legal_advice') {
    return { reasonCode: 'DENY_LEGAL_ADVICE', template: 'legal_advice_redirect' }
  }
  if (topic === 'out_of_scope_services_anything') {
    return { reasonCode: 'DENY_OUT_OF_SCOPE_SERVICE', template: 'out_of_scope_service' }
  }
  if (topic === 'medical_advice') {
    return { reasonCode: 'DENY_MEDICAL_ADVICE', template: 'unsafe_or_sensitive' }
  }
  if (topic === 'financial_advice') {
    return { reasonCode: 'DENY_FINANCIAL_ADVICE', template: 'out_of_domain_question' }
  }
  if (topic === 'exact_guaranteed_price') {
    return { reasonCode: 'DENY_EXACT_GUARANTEED_PRICE', template: 'cannot_do_action' }
  }
  if (topic === 'fear_based_upsell') {
    return { reasonCode: 'DENY_FEAR_BASED_UPSELL', template: 'unsafe_or_sensitive' }
  }
  if ((KAEL_FORBIDDEN_TOPICS as readonly string[]).includes(topic)) {
    return { reasonCode: 'DENY_FORBIDDEN_TOPIC', template: 'out_of_domain_question' }
  }
  return null
}
