// SELF-HOST: PostHog disabled — no outbound analytics or feature-flag calls.
import { EVAL_COLLECTIONS_FLAG } from '@n8n/api-types';
import { GlobalConfig } from '@n8n/config';
import type { PublicUser } from '@n8n/db';
import { Service } from '@n8n/di';
import { InstanceSettings } from 'n8n-core';
import type { FeatureFlags, ITelemetryTrackProperties } from 'n8n-workflow';

@Service()
export class PostHogClient {
	constructor(
		private readonly instanceSettings: InstanceSettings,
		private readonly globalConfig: GlobalConfig,
	) {}

	async init(): Promise<void> {}

	async stop(): Promise<void> {}

	track(_payload: {
		userId: string;
		event: string;
		properties: ITelemetryTrackProperties;
	}): void {}

	groupIdentify(_payload: {
		instanceId: string;
		distinctId?: string;
		properties: Record<string, string | number> | undefined;
	}): void {}

	identify(_payload: {
		distinctId: string;
		properties: Record<string | number, unknown> | undefined;
	}): void {}

	async getFeatureFlags(_user: Pick<PublicUser, 'id' | 'createdAt'>): Promise<FeatureFlags> {
		return this.applyEnvOverrides({});
	}

	private applyEnvOverrides(flags: FeatureFlags): FeatureFlags {
		const overrides: FeatureFlags = {};
		if (this.globalConfig.evaluation.collectionsEnabled) {
			overrides[EVAL_COLLECTIONS_FLAG] = true;
		}
		return Object.keys(overrides).length === 0 ? flags : { ...flags, ...overrides };
	}
}
