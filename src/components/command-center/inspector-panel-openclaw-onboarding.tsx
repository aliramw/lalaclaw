import { ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { OpenClawOnboardingSelectField } from "@/components/command-center/inspector-panel-primitives";
import {
  ButtonSurface as Button,
  CardContentSurface as CardContent,
  CardSurface as Card,
  SwitchSurface as Switch,
} from "@/components/command-center/inspector-panel-surfaces";
import {
  getOpenClawCapabilityDetectionText,
  getOpenClawOnboardingFormState,
  getOpenClawOnboardingAuthOptions,
  getOpenClawOnboardingDaemonRuntimeOptions,
  getOpenClawOnboardingFlowOptions,
  getOpenClawOnboardingGatewayAuthOptions,
  getOpenClawOnboardingGatewayTokenModeOptions,
  getOpenClawOnboardingOptionLabels,
  getOpenClawOnboardingSecretModeOptions,
} from "@/components/command-center/inspector-panel-utils";
import { useI18n } from "@/lib/i18n";

type InspectorRecord = Record<string, any>;
type InspectorMessages = ReturnType<typeof useI18n>["messages"];
type InspectorFlowHandler = (...args: any[]) => any;
type InspectorFormValues = Record<string, unknown>;

const OPENCLAW_MANAGED_AUTH_CHOICES = new Set([
  "github-copilot",
  "google-gemini-cli",
]);

export function OpenClawOnboardingPanel({
  busy = false,
  error = "",
  loading = false,
  messages,
  onChange,
  onRefreshCapabilities,
  onReload,
  onSubmit,
  refreshResult = null,
  result = null,
  state = null,
  values = {},
  showTitle = true,
}: {
  busy?: boolean;
  error?: string;
  loading?: boolean;
  messages: InspectorMessages;
  onChange?: (fieldKey: any, value: any) => void;
  onRefreshCapabilities?: InspectorFlowHandler;
  onReload?: InspectorFlowHandler;
  onSubmit?: InspectorFlowHandler;
  refreshResult?: InspectorRecord | null;
  result?: InspectorRecord | null;
  state?: InspectorRecord | null;
  values?: InspectorFormValues;
  showTitle?: boolean;
}) {
  const onboardingFormState = getOpenClawOnboardingFormState(values, state);
  const authChoice = onboardingFormState.authChoice;
  const daemonRuntime = onboardingFormState.daemonRuntime;
  const flow = onboardingFormState.flow;
  const gatewayAuth = onboardingFormState.gatewayAuth;
  const secretInputMode = onboardingFormState.secretInputMode;
  const gatewayTokenInputMode = onboardingFormState.gatewayTokenInputMode;
  const gatewayBind = onboardingFormState.gatewayBind;
  const installDaemon = onboardingFormState.installDaemon;
  const skipHealthCheck = onboardingFormState.skipHealthCheck;
  const supportedGatewayBinds = onboardingFormState.supportedGatewayBinds;
  const normalizedValues = onboardingFormState.values;
  const authOptions = getOpenClawOnboardingAuthOptions(messages, state);
  const daemonRuntimeOptions = getOpenClawOnboardingDaemonRuntimeOptions(messages, state);
  const flowOptions = getOpenClawOnboardingFlowOptions(messages, state);
  const gatewayAuthOptions = getOpenClawOnboardingGatewayAuthOptions(messages, state);
  const gatewayTokenModeOptions = getOpenClawOnboardingGatewayTokenModeOptions(messages, state);
  const secretModeOptions = getOpenClawOnboardingSecretModeOptions(messages, state);
  const gatewayBindOptions = supportedGatewayBinds.map((value) => ({
    value,
    label: messages.inspector.openClawConfig.fields.gatewayBind.options?.[value] || value,
  }));
  const usesManagedAuth = OPENCLAW_MANAGED_AUTH_CHOICES.has(authChoice);
  const showCustomProviderFields = authChoice === "custom-api-key";
  const showProviderEndpointFields = authChoice === "custom-api-key" || authChoice === "ollama";
  const showTokenAuthFields = authChoice === "token";
  const supportsApiKey = authChoice !== "skip" && authChoice !== "ollama" && authChoice !== "token" && !usesManagedAuth;
  const showGatewayPasswordInput = gatewayAuth === "password";
  const showGatewayTokenFields = gatewayAuth === "token";
  const showPlaintextApiKeyInput = supportsApiKey && secretInputMode === "plaintext";
  const showPlaintextGatewayTokenInput = showGatewayTokenFields && gatewayTokenInputMode === "plaintext";
  const capabilityRows = [
    {
      label: messages.inspector.openClawOnboarding.capabilities.flows,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedFlows) ? state.supportedFlows : [],
        flowOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.providers,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedAuthChoices) ? state.supportedAuthChoices : [],
        authOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.gatewayBinds,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedGatewayBinds) ? state.supportedGatewayBinds : [],
        gatewayBindOptions,
      ),
    },
    {
      label: messages.inspector.openClawOnboarding.capabilities.daemonRuntimes,
      values: getOpenClawOnboardingOptionLabels(
        Array.isArray(state?.supportedDaemonRuntimes) ? state.supportedDaemonRuntimes : [],
        daemonRuntimeOptions,
      ),
    },
  ].filter((row) => row.values.length);
  const fixedCapabilityHint = messages.inspector.openClawOnboarding.capabilities.lockedHint;
  const capabilityDetection = getOpenClawCapabilityDetectionText(messages, state?.capabilityDetection);
  const refreshCapabilityDetection = getOpenClawCapabilityDetectionText(messages, refreshResult?.capabilityDetection);
  const resultCapabilityDetection = getOpenClawCapabilityDetectionText(messages, result?.capabilityDetection);

  return (
    <div className={showTitle ? "grid gap-2" : "grid"}>
      {showTitle ? (
        <div className="text-[11px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
          {messages.inspector.openClawOnboarding.title}
        </div>
      ) : null}
      <Card className="overflow-hidden rounded-2xl border-border/70 bg-card/70 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <CardContent className="space-y-3 px-3.5 py-3">
          <div className="text-[12px] leading-5 text-muted-foreground">
            {messages.inspector.openClawOnboarding.description}
          </div>
          <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={state?.ready ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                {state?.ready ? messages.inspector.openClawOnboarding.statuses.ready : messages.inspector.openClawOnboarding.statuses.required}
              </Badge>
              {state?.configPath ? (
                <div className="min-w-0 break-all font-mono text-[12px] text-foreground">{state.configPath}</div>
              ) : null}
            </div>
            {state?.validation ? (
              <div className="mt-2 text-muted-foreground">
                {messages.inspector.openClawOnboarding.labels.validation}:{" "}
                {state.validation.ok ? messages.inspector.openClawOnboarding.validation.valid : messages.inspector.openClawOnboarding.validation.invalid}
              </div>
            ) : null}
            {state?.service ? (
              <div className="mt-2 space-y-1 text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.service.title}</span>
                  {": "}
                  <span>
                    {state.service.installed
                      ? (state.service.running
                        ? messages.inspector.openClawOnboarding.service.installedRunning
                        : messages.inspector.openClawOnboarding.service.installedStopped)
                      : messages.inspector.openClawOnboarding.service.notInstalled}
                  </span>
                </div>
                {state.service.label ? (
                  <div>
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.service.label}</span>
                    {": "}
                    <span className="font-mono">{state.service.label}</span>
                  </div>
                ) : null}
                {state.service.plistPath ? (
                  <div className="break-all">
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.service.launchAgent}</span>
                    {": "}
                    <span className="font-mono">{state.service.plistPath}</span>
                  </div>
                ) : null}
                {state.service.logDir ? (
                  <div className="break-all">
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.service.logs}</span>
                    {": "}
                    <span className="font-mono">{state.service.logDir}</span>
                  </div>
                ) : null}
              </div>
            ) : null}
            {capabilityRows.length ? (
              <div className="mt-3 rounded-xl border border-border/60 bg-muted/20 px-3 py-2.5">
                <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                  {messages.inspector.openClawOnboarding.capabilities.title}
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-[12px] leading-5 text-muted-foreground">
                    <span className="font-medium text-foreground">{messages.inspector.openClawOnboarding.capabilities.detectedBy}</span>
                    {": "}
                    <span>{capabilityDetection.sourceLabel}</span>
                    {capabilityDetection.reasonLabel ? (
                      <>
                        {" · "}
                        <span>{capabilityDetection.reasonLabel}</span>
                      </>
                    ) : null}
                    {capabilityDetection.signature ? (
                      <>
                        {" · "}
                        <span>{messages.inspector.openClawOnboarding.capabilities.signature}: {capabilityDetection.signature}</span>
                      </>
                    ) : null}
                    {capabilityDetection.detectedAt ? (
                      <>
                        {" · "}
                        <span>{messages.inspector.openClawOnboarding.capabilities.detectedAt}: {capabilityDetection.detectedAt}</span>
                      </>
                    ) : null}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 rounded-full px-2.5 text-[11px]"
                    disabled={loading || busy}
                    onClick={() => onRefreshCapabilities?.()}
                  >
                    {loading ? messages.inspector.openClawOnboarding.refreshingCapabilities : messages.inspector.openClawOnboarding.refreshCapabilities}
                  </Button>
                </div>
                <div className="mt-2 space-y-1.5 text-[12px] leading-5 text-muted-foreground">
                  {capabilityRows.map((row) => (
                    <div key={row.label}>
                      <span className="font-medium text-foreground">{row.label}</span>
                      {": "}
                      <span>{row.values.join(" / ") || messages.inspector.openClawOnboarding.capabilities.empty}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
          <div className="grid gap-3">
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.flow.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.flow.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.flow.label}
              options={flowOptions}
              value={flow}
              onChange={(nextValue) => onChange?.("flow", nextValue)}
            />
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.authChoice.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.authChoice.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.authChoice.label}
              options={authOptions}
              value={authChoice}
              onChange={(nextValue) => onChange?.("authChoice", nextValue)}
            />
            {showTokenAuthFields ? (
              <>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenProvider.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenProvider.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenProvider.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenProvider.placeholder}
                    value={normalizedValues.tokenProvider}
                    onChange={(event) => onChange?.("tokenProvider", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.token.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.token.description}</div>
                  <input
                    type="password"
                    aria-label={messages.inspector.openClawOnboarding.fields.token.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.token.placeholder}
                    value={normalizedValues.token}
                    onChange={(event) => onChange?.("token", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenProfileId.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenProfileId.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenProfileId.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenProfileId.placeholder}
                    value={normalizedValues.tokenProfileId}
                    onChange={(event) => onChange?.("tokenProfileId", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.tokenExpiresIn.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.tokenExpiresIn.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.tokenExpiresIn.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.tokenExpiresIn.placeholder}
                    value={normalizedValues.tokenExpiresIn}
                    onChange={(event) => onChange?.("tokenExpiresIn", event.target.value)}
                  />
                </div>
              </>
            ) : null}
            {usesManagedAuth ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.managedAuth.title}</div>
                <div className="mt-1">{messages.inspector.openClawOnboarding.managedAuth.description}</div>
              </div>
            ) : null}
            {supportsApiKey ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.secretInputMode.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.secretInputMode.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.secretInputMode.label}
                options={secretModeOptions}
                value={secretInputMode}
                onChange={(nextValue) => onChange?.("secretInputMode", nextValue)}
              />
            ) : null}
            {showPlaintextApiKeyInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.apiKey.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.apiKey.placeholder}
                  value={normalizedValues.apiKey}
                  onChange={(event) => onChange?.("apiKey", event.target.value)}
                />
              </div>
            ) : null}
            {supportsApiKey && secretInputMode === "ref" ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3 text-[12px] leading-5 text-muted-foreground">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.apiKey.label}</div>
                <div className="mt-1">{messages.inspector.openClawOnboarding.fields.secretInputMode.refHint}</div>
              </div>
            ) : null}
            {showProviderEndpointFields ? (
              <>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customBaseUrl.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customBaseUrl.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.customBaseUrl.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.customBaseUrl.placeholder}
                    value={normalizedValues.customBaseUrl}
                    onChange={(event) => onChange?.("customBaseUrl", event.target.value)}
                  />
                </div>
                <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customModelId.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customModelId.description}</div>
                  <input
                    type="text"
                    aria-label={messages.inspector.openClawOnboarding.fields.customModelId.label}
                    className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                    disabled={loading || busy}
                    placeholder={messages.inspector.openClawOnboarding.fields.customModelId.placeholder}
                    value={normalizedValues.customModelId}
                    onChange={(event) => onChange?.("customModelId", event.target.value)}
                  />
                </div>
                {showCustomProviderFields ? (
                  <>
                    <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                      <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customProviderId.label}</div>
                      <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customProviderId.description}</div>
                      <input
                        type="text"
                        aria-label={messages.inspector.openClawOnboarding.fields.customProviderId.label}
                        className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                        disabled={loading || busy}
                        placeholder={messages.inspector.openClawOnboarding.fields.customProviderId.placeholder}
                        value={normalizedValues.customProviderId}
                        onChange={(event) => onChange?.("customProviderId", event.target.value)}
                      />
                    </div>
                    <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                      <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.customCompatibility.label}</div>
                      <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.customCompatibility.description}</div>
                      <div className="relative mt-3">
                        <select
                          aria-label={messages.inspector.openClawOnboarding.fields.customCompatibility.label}
                          className="h-9 w-full appearance-none rounded-xl border border-border/70 bg-background pl-3 pr-10 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                          disabled={loading || busy}
                          value={normalizedValues.customCompatibility}
                          onChange={(event) => onChange?.("customCompatibility", event.target.value)}
                        >
                          {Object.entries(messages.inspector.openClawOnboarding.fields.customCompatibility.options || {}).map(([value, label]) => (
                            <option key={value} value={value}>{String(label)}</option>
                          ))}
                        </select>
                        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-muted-foreground" aria-hidden="true">
                          <ChevronDown className="h-4 w-4" />
                        </span>
                      </div>
                    </div>
                  </>
                ) : null}
              </>
            ) : null}
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayBind.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.gatewayBind.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.gatewayBind.label}
              options={gatewayBindOptions}
              value={gatewayBind}
              onChange={(nextValue) => onChange?.("gatewayBind", nextValue)}
            />
            <OpenClawOnboardingSelectField
              ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayAuth.label}
              busy={busy}
              description={messages.inspector.openClawOnboarding.fields.gatewayAuth.description}
              disabled={loading}
              fixedHint={fixedCapabilityHint}
              label={messages.inspector.openClawOnboarding.fields.gatewayAuth.label}
              options={gatewayAuthOptions}
              value={gatewayAuth}
              onChange={(nextValue) => onChange?.("gatewayAuth", nextValue)}
            />
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <label className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.installDaemon.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.installDaemon.description}</div>
                </div>
                <Switch
                  checked={installDaemon}
                  aria-label={messages.inspector.openClawOnboarding.fields.installDaemon.label}
                  disabled={loading || busy}
                  onCheckedChange={(checked) => onChange?.("installDaemon", checked)}
                />
              </label>
              <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                {installDaemon
                  ? messages.inspector.openClawOnboarding.fields.installDaemon.enabledHint
                  : messages.inspector.openClawOnboarding.fields.installDaemon.disabledHint}
              </div>
            </div>
            {installDaemon ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.daemonRuntime.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.daemonRuntime.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.daemonRuntime.label}
                options={daemonRuntimeOptions}
                value={daemonRuntime}
                onChange={(nextValue) => onChange?.("daemonRuntime", nextValue)}
              />
            ) : null}
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <label className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.skipHealthCheck.label}</div>
                  <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.skipHealthCheck.description}</div>
                </div>
                <Switch
                  checked={skipHealthCheck}
                  aria-label={messages.inspector.openClawOnboarding.fields.skipHealthCheck.label}
                  disabled={loading || busy}
                  onCheckedChange={(checked) => onChange?.("skipHealthCheck", checked)}
                />
              </label>
              <div className="mt-2 text-[12px] leading-5 text-muted-foreground">
                {messages.inspector.openClawOnboarding.fields.skipHealthCheck.hint}
              </div>
            </div>
            {showGatewayTokenFields ? (
              <OpenClawOnboardingSelectField
                ariaLabel={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.label}
                busy={busy}
                description={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.description}
                disabled={loading}
                fixedHint={fixedCapabilityHint}
                label={messages.inspector.openClawOnboarding.fields.gatewayTokenInputMode.label}
                options={gatewayTokenModeOptions}
                value={gatewayTokenInputMode}
                onChange={(nextValue) => onChange?.("gatewayTokenInputMode", nextValue)}
              />
            ) : null}
            {showPlaintextGatewayTokenInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayToken.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayToken.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayToken.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayToken.placeholder}
                  value={normalizedValues.gatewayToken}
                  onChange={(event) => onChange?.("gatewayToken", event.target.value)}
                />
              </div>
            ) : null}
            {showGatewayTokenFields && gatewayTokenInputMode === "ref" ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.description}</div>
                <input
                  type="text"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayTokenRefEnv.placeholder}
                  value={normalizedValues.gatewayTokenRefEnv}
                  onChange={(event) => onChange?.("gatewayTokenRefEnv", event.target.value)}
                />
              </div>
            ) : null}
            {showGatewayPasswordInput ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.gatewayPassword.label}</div>
                <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.gatewayPassword.description}</div>
                <input
                  type="password"
                  aria-label={messages.inspector.openClawOnboarding.fields.gatewayPassword.label}
                  className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                  disabled={loading || busy}
                  placeholder={messages.inspector.openClawOnboarding.fields.gatewayPassword.placeholder}
                  value={normalizedValues.gatewayPassword}
                  onChange={(event) => onChange?.("gatewayPassword", event.target.value)}
                />
              </div>
            ) : null}
            <div className="rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.fields.workspace.label}</div>
              <div className="text-[12px] leading-5 text-muted-foreground">{messages.inspector.openClawOnboarding.fields.workspace.description}</div>
              <input
                type="text"
                aria-label={messages.inspector.openClawOnboarding.fields.workspace.label}
                className="mt-3 h-9 w-full rounded-xl border border-border/70 bg-background px-3 text-sm text-foreground outline-none transition focus-visible:ring-2 focus-visible:ring-ring/40"
                disabled={loading || busy}
                placeholder={messages.inspector.openClawOnboarding.fields.workspace.placeholder}
                value={normalizedValues.workspace}
                onChange={(event) => onChange?.("workspace", event.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              disabled={loading || busy}
              variant="ghost"
              aria-label={messages.inspector.openClawOnboarding.reload}
              className="h-8 rounded-full px-3"
              onClick={() => onReload?.()}
            >
              {loading ? messages.inspector.openClawOnboarding.reloading : messages.inspector.openClawOnboarding.reload}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={loading || busy}
              className="h-8 rounded-full px-3"
              onClick={() => onSubmit?.()}
            >
              {busy ? messages.inspector.openClawOnboarding.running : messages.inspector.openClawOnboarding.run}
            </Button>
          </div>
          {error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-[12px] leading-5 text-destructive">
              {error}
            </div>
          ) : null}
          {refreshResult ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.refreshResultTitle}</div>
                <Badge variant={refreshResult.ok ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                  {refreshResult.ok
                    ? messages.inspector.openClawOnboarding.refreshStatuses.success
                    : messages.inspector.openClawOnboarding.refreshStatuses.failed}
                </Badge>
              </div>
              {refreshResult.requestedAt ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.refreshRequestedAt}
                  </div>
                  <div className="text-[12px] text-foreground">{refreshResult.requestedAt}</div>
                </div>
              ) : null}
              {refreshResult.capabilityDetection ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.capabilityDetection}
                  </div>
                  <div className="text-[12px] text-foreground">
                    {refreshCapabilityDetection.sourceLabel}
                    {refreshCapabilityDetection.reasonLabel ? ` · ${refreshCapabilityDetection.reasonLabel}` : ""}
                    {refreshCapabilityDetection.signature ? ` · ${messages.inspector.openClawOnboarding.capabilities.signature}: ${refreshCapabilityDetection.signature}` : ""}
                    {refreshCapabilityDetection.detectedAt ? ` · ${messages.inspector.openClawOnboarding.capabilities.detectedAt}: ${refreshCapabilityDetection.detectedAt}` : ""}
                  </div>
                </div>
              ) : null}
              {refreshResult.error ? (
                <div className="text-[12px] leading-5 text-destructive">
                  {refreshResult.error}
                </div>
              ) : null}
            </div>
          ) : null}
          {result ? (
            <div className="space-y-2 rounded-2xl border border-border/70 bg-background/80 px-3 py-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-semibold text-foreground">{messages.inspector.openClawOnboarding.resultTitle}</div>
                <Badge variant={result.ok ? "success" : "secondary"} className="px-2 py-0.5 text-[11px] leading-5">
                  {result.ok ? messages.inspector.openClawOnboarding.statuses.ready : messages.inspector.openClawOnboarding.statuses.required}
                </Badge>
              </div>
              {result.commandResult?.command?.display ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.command}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">{result.commandResult.command.display}</div>
                </div>
              ) : null}
              {result.capabilityDetection ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.capabilityDetection}
                  </div>
                  <div className="text-[12px] text-foreground">
                    {resultCapabilityDetection.sourceLabel}
                    {resultCapabilityDetection.reasonLabel ? ` · ${resultCapabilityDetection.reasonLabel}` : ""}
                    {resultCapabilityDetection.signature ? ` · ${messages.inspector.openClawOnboarding.capabilities.signature}: ${resultCapabilityDetection.signature}` : ""}
                    {resultCapabilityDetection.detectedAt ? ` · ${messages.inspector.openClawOnboarding.capabilities.detectedAt}: ${resultCapabilityDetection.detectedAt}` : ""}
                  </div>
                </div>
              ) : null}
              {result.healthCheck ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.health}
                  </div>
                  <div className="font-mono text-[12px] text-foreground">{result.healthCheck.status}</div>
                </div>
              ) : null}
              {result.commandResult?.stdout ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.stdout}
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stdout}</pre>
                </div>
              ) : null}
              {result.commandResult?.stderr ? (
                <div>
                  <div className="text-[10px] font-medium uppercase tracking-[0.08em] text-muted-foreground">
                    {messages.inspector.openClawOnboarding.labels.stderr}
                  </div>
                  <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all rounded-xl border border-border/60 bg-muted/30 px-3 py-2 font-mono text-[11px] leading-5 text-foreground">{result.commandResult.stderr}</pre>
                </div>
              ) : null}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
