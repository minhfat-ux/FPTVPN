/**
 * Which (provider, model) pairs can actually read an image?
 *
 * Kept in its own module so the OpenAI-compatible adapter can use it without a
 * circular import through `providers/index.js`.
 *
 * The provider kind alone is not enough: the GLM kind is vision-capable in
 * general, but its default `glm-4-flash` is not, and gateways answer a stray
 * `image_url` part with a hard 400
 * (`messages.content.type 参数非法，取值范围 ['text']` from GLM, 400 from DeepSeek)
 * instead of ignoring it.
 */

/** Model ids that definitely take image inputs. */
const VISION_MODEL_HINT =
  /(gpt-4o|gpt-4\.1|gpt-5|chatgpt-4o|o3|o4-mini|claude|gemini|glm-4v|glm-4\.5v|glm-5v|qwen[\w.-]*vl|-vl-|vision|llava|pixtral|internvl|molmo)/i;

/** Text-only models that reject an image part rather than ignoring it. */
const TEXT_ONLY_MODEL_HINT =
  /(deepseek|glm-4-flash|glm-4\.5-air|glm-4\.5($|-)|glm-4\.6|glm-5\.3|llama-3|llama-4-scout|mixtral|mistral|qwen2\.5-(7b|14b|32b|72b))/i;

/**
 * The model id decides when it is recognisable (`glm-4v-flash` → yes,
 * `glm-4-flash` → no); otherwise the provider kind's own `supportsVision` flag is
 * used, so unknown models keep working exactly as before.
 */
export function modelAcceptsImages(provider, model = null) {
  if (!provider) return false;
  const id = String(model ?? provider.defaultModel ?? "");
  if (id && VISION_MODEL_HINT.test(id)) return true;
  if (id && TEXT_ONLY_MODEL_HINT.test(id)) return false;
  return Boolean(provider.supportsVision);
}
