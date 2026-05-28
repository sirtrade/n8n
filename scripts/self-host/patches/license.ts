// SELF-HOST: license checks disabled — all Enterprise features enabled, no license server calls.
import type { LicenseProvider } from '@n8n/backend-common';
import { Logger } from '@n8n/backend-common';
import { GlobalConfig } from '@n8n/config';
import {
	DEFAULT_WORKFLOW_HISTORY_PRUNE_LIMIT,
	LICENSE_FEATURES,
	LICENSE_QUOTAS,
	UNLIMITED_LICENSE_QUOTA,
	type BooleanLicenseFeature,
	type NumericLicenseFeature,
} from '@n8n/constants';
import { SettingsRepository } from '@n8n/db';
import { OnLeaderStepdown, OnLeaderTakeover, OnPubSubEvent, OnShutdown } from '@n8n/decorators';
import { Service } from '@n8n/di';
import type { TEntitlement, TLicenseBlock } from '@n8n_io/license-sdk';
import { InstanceSettings } from 'n8n-core';

import { LicenseMetricsService } from '@/metrics/license-metrics.service';

import { SETTINGS_LICENSE_CERT_KEY } from './constants';

const STUB_PLAN_NAME = 'Enterprise';

export type FeatureReturnType = Partial<
	{
		planName: string;
	} & { [K in NumericLicenseFeature]: number } & { [K in BooleanLicenseFeature]: boolean }
>;

type LicenseRefreshCallback = (cert: string) => void;

@Service()
export class License implements LicenseProvider {
	private refreshCallbacks: LicenseRefreshCallback[] = [];

	constructor(
		private readonly logger: Logger,
		private readonly instanceSettings: InstanceSettings,
		private readonly settingsRepository: SettingsRepository,
		private readonly licenseMetricsService: LicenseMetricsService,
		private readonly globalConfig: GlobalConfig,
	) {
		this.logger = this.logger.scoped('license');
	}

	async init(_options: { forceRecreate?: boolean; isCli?: boolean } = {}): Promise<void> {
		this.logger.debug('License stub initialized (all features enabled, no license server)');
	}

	async loadCertStr(): Promise<TLicenseBlock> {
		return this.globalConfig.license.cert ?? '';
	}

	onCertRefresh(refreshCallback: LicenseRefreshCallback): () => void {
		this.refreshCallbacks.push(refreshCallback);
		return () => {
			const index = this.refreshCallbacks.indexOf(refreshCallback);
			if (index > -1) this.refreshCallbacks.splice(index, 1);
		};
	}

	async activate(_activationKey: string, _eulaUri?: string, _userEmail?: string): Promise<void> {}

	@OnPubSubEvent('reload-license')
	async reload(): Promise<void> {}

	async renew(): Promise<void> {}

	async clear(): Promise<void> {
		await this.settingsRepository.delete({ key: SETTINGS_LICENSE_CERT_KEY });
		this.logger.info('License certificate cleared from database');
	}

	@OnShutdown()
	async shutdown(): Promise<void> {}

	isLicensed(feature: BooleanLicenseFeature): boolean {
		// These flags are restrictions, not capabilities — keep them off.
		if (
			feature === LICENSE_FEATURES.API_DISABLED ||
			feature === LICENSE_FEATURES.SHOW_NON_PROD_BANNER
		) {
			return false;
		}
		return true;
	}

	isCertValid(): boolean {
		return true;
	}

	hasFeatureInCert(_feature: BooleanLicenseFeature): boolean {
		return true;
	}

	getCurrentEntitlements(): TEntitlement[] {
		return [];
	}

	getValue<T extends keyof FeatureReturnType>(feature: T): FeatureReturnType[T] {
		if (feature === 'planName') return STUB_PLAN_NAME as FeatureReturnType[T];
		if (feature === LICENSE_QUOTAS.AI_CREDITS) return 0 as FeatureReturnType[T];
		if (feature === LICENSE_QUOTAS.AI_GATEWAY_BUDGET) return 0 as FeatureReturnType[T];
		if (feature === LICENSE_QUOTAS.TEAM_PROJECT_LIMIT) {
			return UNLIMITED_LICENSE_QUOTA as FeatureReturnType[T];
		}
		if (typeof feature === 'string' && feature.startsWith('quota:')) {
			return UNLIMITED_LICENSE_QUOTA as FeatureReturnType[T];
		}
		return true as FeatureReturnType[T];
	}

	getManagementJwt(): string {
		return '';
	}

	getMainPlan(): TEntitlement | undefined {
		return undefined;
	}

	getConsumerId(): string {
		return this.instanceSettings.instanceId;
	}

	getPlanName(): string {
		return STUB_PLAN_NAME;
	}

	getExpiryDate(): Date | null {
		return null;
	}

	getTerminationDate(): Date | null {
		return null;
	}

	getExpiringInDays(): number | undefined {
		return undefined;
	}

	getTerminatingInDays(): number | undefined {
		return undefined;
	}

	getInfo(): string {
		return `n8n self-host stub (${STUB_PLAN_NAME}, all features enabled)`;
	}

	isWithinUsersLimit(): boolean {
		return true;
	}

	@OnLeaderTakeover()
	enableAutoRenewals(): void {}

	@OnLeaderStepdown()
	disableAutoRenewals(): void {}

	isDynamicCredentialsEnabled() {
		return this.isLicensed(LICENSE_FEATURES.DYNAMIC_CREDENTIALS);
	}

	isSharingEnabled() {
		return this.isLicensed(LICENSE_FEATURES.SHARING);
	}

	isLogStreamingEnabled() {
		return this.isLicensed(LICENSE_FEATURES.LOG_STREAMING);
	}

	isLdapEnabled() {
		return this.isLicensed(LICENSE_FEATURES.LDAP);
	}

	isSamlEnabled() {
		return this.isLicensed(LICENSE_FEATURES.SAML);
	}

	isAiAssistantEnabled() {
		return this.isLicensed(LICENSE_FEATURES.AI_ASSISTANT);
	}

	isAskAiEnabled() {
		return this.isLicensed(LICENSE_FEATURES.ASK_AI);
	}

	isAiCreditsEnabled() {
		return this.isLicensed(LICENSE_FEATURES.AI_CREDITS);
	}

	isAdvancedExecutionFiltersEnabled() {
		return this.isLicensed(LICENSE_FEATURES.ADVANCED_EXECUTION_FILTERS);
	}

	isAdvancedPermissionsLicensed() {
		return this.isLicensed(LICENSE_FEATURES.ADVANCED_PERMISSIONS);
	}

	isDebugInEditorLicensed() {
		return this.isLicensed(LICENSE_FEATURES.DEBUG_IN_EDITOR);
	}

	isBinaryDataS3Licensed() {
		return this.isLicensed(LICENSE_FEATURES.BINARY_DATA_S3);
	}

	isMultiMainLicensed() {
		return this.isLicensed(LICENSE_FEATURES.MULTIPLE_MAIN_INSTANCES);
	}

	isVariablesEnabled() {
		return this.isLicensed(LICENSE_FEATURES.VARIABLES);
	}

	isSourceControlLicensed() {
		return this.isLicensed(LICENSE_FEATURES.SOURCE_CONTROL);
	}

	isExternalSecretsEnabled() {
		return this.isLicensed(LICENSE_FEATURES.EXTERNAL_SECRETS);
	}

	isAPIDisabled() {
		return this.isLicensed(LICENSE_FEATURES.API_DISABLED);
	}

	isWorkerViewLicensed() {
		return this.isLicensed(LICENSE_FEATURES.WORKER_VIEW);
	}

	isProjectRoleAdminLicensed() {
		return this.isLicensed(LICENSE_FEATURES.PROJECT_ROLE_ADMIN);
	}

	isProjectRoleEditorLicensed() {
		return this.isLicensed(LICENSE_FEATURES.PROJECT_ROLE_EDITOR);
	}

	isProjectRoleViewerLicensed() {
		return this.isLicensed(LICENSE_FEATURES.PROJECT_ROLE_VIEWER);
	}

	isCustomNpmRegistryEnabled() {
		return this.isLicensed(LICENSE_FEATURES.COMMUNITY_NODES_CUSTOM_REGISTRY);
	}

	isFoldersEnabled() {
		return this.isLicensed(LICENSE_FEATURES.FOLDERS);
	}

	getUsersLimit() {
		return this.getValue(LICENSE_QUOTAS.USERS_LIMIT) ?? UNLIMITED_LICENSE_QUOTA;
	}

	getTriggerLimit() {
		return this.getValue(LICENSE_QUOTAS.TRIGGER_LIMIT) ?? UNLIMITED_LICENSE_QUOTA;
	}

	getVariablesLimit() {
		return this.getValue(LICENSE_QUOTAS.VARIABLES_LIMIT) ?? UNLIMITED_LICENSE_QUOTA;
	}

	getAiCredits() {
		return this.getValue(LICENSE_QUOTAS.AI_CREDITS) ?? 0;
	}

	getWorkflowHistoryPruneLimit() {
		return (
			this.getValue(LICENSE_QUOTAS.WORKFLOW_HISTORY_PRUNE_LIMIT) ??
			DEFAULT_WORKFLOW_HISTORY_PRUNE_LIMIT
		);
	}

	getTeamProjectLimit() {
		return this.getValue(LICENSE_QUOTAS.TEAM_PROJECT_LIMIT) ?? UNLIMITED_LICENSE_QUOTA;
	}
}
