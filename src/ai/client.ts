import type Anthropic from '@anthropic-ai/sdk';

export const ANTHROPIC_CLIENT = 'ANTHROPIC_CLIENT';

/** The one method we use; lets tests pass a scripted fake without a network. */
export type AnthropicLike = {
  messages: { create(params: Anthropic.MessageCreateParamsNonStreaming, options?: { timeout?: number }): Promise<Anthropic.Message> };
};
