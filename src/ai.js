/*
 * Optional Claude integration for program generation, using the official Anthropic
 * TypeScript SDK (vendored browser bundle in vendor/anthropic).
 *
 * The API key is entered by the user and kept only in this browser's localStorage
 * (never in exported data). Calling the API directly from a browser exposes the key to
 * anyone using this device, so this is for personal/prototype use; a production app should
 * proxy requests through its backend.
 */
(function (root) {
  'use strict';

  const KEY_STORAGE = 'athleteos:anthropic-key';
  const MODEL = 'claude-opus-5-5';
  let clientPromise = null;
  let clientKey = null;

  function getKey() {
    try {
      return localStorage.getItem(KEY_STORAGE) || '';
    } catch {
      return '';
    }
  }

  function setKey(key) {
    try {
      if (key) localStorage.setItem(KEY_STORAGE, key.trim());
      else localStorage.removeItem(KEY_STORAGE);
    } catch {}
    clientPromise = null;
  }

  const hasKey = () => !!getKey();

  function client() {
    const key = getKey();
    if (!key) return Promise.reject(new Error('Add your Anthropic API key in Settings to use Claude.'));
    if (!clientPromise || clientKey !== key) {
      clientKey = key;
      clientPromise = import(new URL('vendor/anthropic/anthropic-sdk.mjs', document.baseURI).href).then(
        ({ Anthropic }) => new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true })
      );
    }
    return clientPromise;
  }

  function friendlyError(err, Anthropic) {
    if (Anthropic && err instanceof Anthropic.AuthenticationError) return 'Your Anthropic API key was rejected. Check it in Settings.';
    if (Anthropic && err instanceof Anthropic.PermissionDeniedError) return 'This API key doesn’t have access to that model.';
    if (Anthropic && err instanceof Anthropic.RateLimitError) return 'Claude is rate-limited right now. Wait a minute and try again.';
    if (Anthropic && err instanceof Anthropic.BadRequestError) return 'Claude couldn’t process that request: ' + (err.message || 'bad request');
    if (Anthropic && err instanceof Anthropic.APIConnectionError) return 'Couldn’t reach the Claude API. Check your connection.';
    if (Anthropic && err instanceof Anthropic.APIError) return `Claude API error (${err.status || 'unknown'}): ${err.message}`;
    return err && err.message ? err.message : 'Something went wrong talking to Claude.';
  }

  /*
   * generateProgram(input, { fallbacks, onProgress, signal }) -> program (Program.normalizeProgram shape)
   * Streams a structured-output response and validates it into a program.
   */
  async function generateProgram(input, { fallbacks = true, onProgress = () => {}, signal } = {}) {
    const P = root.Program;
    const { system, user } = P.buildAIRequest(input);
    const anthropic = await client();
    const Anthropic = anthropic.constructor;
    const params = {
      model: MODEL,
      max_tokens: 32000,
      output_config: { effort: 'high', format: { type: 'json_schema', schema: P.PROGRAM_SCHEMA } },
      system,
      messages: [{ role: 'user', content: user }],
    };
    // Server-side refusal fallback (opt-out in Settings): a declined request is re-run on
    // Anthropic's recommended fallback model instead of failing.
    if (fallbacks) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    let chars = 0;
    try {
      const stream = anthropic.beta.messages.stream(params, { signal });
      stream.on('text', (delta) => {
        chars += delta.length;
        onProgress(chars);
      });
      const message = await stream.finalMessage();
      if (message.stop_reason === 'refusal') {
        const why = message.stop_details && message.stop_details.explanation;
        throw new Error('Claude declined to create this program' + (why ? `: ${why}` : '.'));
      }
      if (message.stop_reason === 'max_tokens') throw new Error('The program was too long to finish. Try fewer days or weeks.');
      const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      let json;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error('Claude returned something that wasn’t a valid program. Please try again.');
      }
      const program = P.programFromAI(json);
      program.meta = { model: message.model, fallbackUsed: message.content.some((b) => b.type === 'fallback') };
      return program;
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new Error(friendlyError(err, Anthropic));
    }
  }

  /*
   * chat({ system, messages:[{role, text}], onText(delta), signal, fallbacks }) -> full reply text
   * Streams a conversational reply. Thinking is always on for this model; effort keeps replies quick.
   */
  async function chat({ system, messages, onText = () => {}, signal, fallbacks = true }) {
    const anthropic = await client();
    const Anthropic = anthropic.constructor;
    const params = {
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low' },
      system,
      messages: messages.map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text })),
    };
    if (fallbacks) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    try {
      const stream = anthropic.beta.messages.stream(params, { signal });
      stream.on('text', (delta) => onText(delta));
      const message = await stream.finalMessage();
      if (message.stop_reason === 'refusal') throw new Error('Claude couldn’t help with that one. Try asking a different way.');
      return message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new Error(friendlyError(err, Anthropic));
    }
  }

  /*
   * estimateMeal(base64, mediaType) -> { items:[{name, qty, kcal, protein, carbs, fat}], note }
   * Looks at a meal photo and returns a structured estimate (per item, per serving).
   */
  async function estimateMeal(base64, mediaType, { fallbacks = true, signal } = {}) {
    const anthropic = await client();
    const Anthropic = anthropic.constructor;
    const params = {
      model: MODEL,
      max_tokens: 4000,
      output_config: { effort: 'low', format: { type: 'json_schema', schema: root.Nutrition.PHOTO_SCHEMA } },
      system: 'You estimate the nutrition of meals from photos for an athlete’s food log. List each visible food with a realistic portion (qty = number of servings of that item, usually 1) and per-serving kcal, protein, carbs and fat in grams. Be conservative and practical. The note is one short sentence (e.g. how confident you are or what to add for recovery).',
      messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } }, { type: 'text', text: 'Estimate this meal.' }] }],
    };
    if (fallbacks) Object.assign(params, { betas: ['server-side-fallback-2026-07-01'], fallbacks: 'default' });
    try {
      const message = await anthropic.beta.messages.stream(params, { signal }).finalMessage();
      if (message.stop_reason === 'refusal') throw new Error('Claude couldn’t estimate that photo.');
      const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
      return JSON.parse(text);
    } catch (err) {
      if (err && err.name === 'AbortError') throw err;
      throw new Error(err instanceof SyntaxError ? 'Claude returned an unexpected answer. Try again.' : friendlyError(err, Anthropic));
    }
  }

  root.AI = { getKey, setKey, hasKey, generateProgram, chat, estimateMeal, MODEL };
})(window);
