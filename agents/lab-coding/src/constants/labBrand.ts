/**
 * Lab Agent / Lab Code brand constants (UI + identity only).
 * Does not change tools or coding capability.
 */

/** Product shell name shown in TUI chrome */
export const LAB_PRODUCT_NAME = 'Lab Agent'

/** Agent self-identity in system prompts */
export const LAB_CODE_IDENTITY = 'Lab Code'

/**
 * Security docs URL shown during first-run onboarding.
 * Override with env LAB_SECURITY_URL when you have the final link.
 */
export const LAB_SECURITY_URL =
  (typeof process !== 'undefined' && process.env.LAB_SECURITY_URL?.trim()) ||
  'https://lab-agent.app/docs/security'

export const LAB_IDENTITY_PREFIX = `You are ${LAB_CODE_IDENTITY}, the coding agent for ${LAB_PRODUCT_NAME}. You help users with software engineering in the terminal.`

export const LAB_SDK_IDENTITY_PREFIX = `You are ${LAB_CODE_IDENTITY}, the coding agent for ${LAB_PRODUCT_NAME}, running in agent/SDK mode.`

export const LAB_AGENT_WORKER_PREFIX = `You are an agent for ${LAB_CODE_IDENTITY} (${LAB_PRODUCT_NAME}). Given the user's message, you should use the tools available to complete the task. Complete the task fully—don't gold-plate, but don't leave it half-done.`
