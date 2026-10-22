// @ts-check

(function (global) {
  "use strict";

  var DEFAULT_CONFIG_URL = "/config-ui.yaml";
  var CONFIG_FILE_LABEL = "config-ui.yaml";
  var DEFAULT_YAML_PARSER_URL =
    "https://cdn.jsdelivr.net/npm/js-yaml@5.4.1/dist/browser/js-yaml.umd.min.js";
  var DEFAULT_HEADER_SELECTOR = "mpr-header";
  var DEFAULT_LOGIN_BUTTON_SELECTOR = "mpr-login-button";
  var DEFAULT_USER_SELECTOR = "mpr-user";
  var DEFAULT_PASSWORD_AUTH_SELECTOR = "mpr-password-auth";
  var DEFAULT_ACCOUNT_PANEL_SELECTOR = "mpr-account-panel";

  var SECTION_ENVIRONMENTS = "environments";
  var SECTION_AUTH = "auth";
  var SECTION_AUTH_PROVIDERS = "auth.providers";
  var SECTION_AUTH_PASSWORD = "auth.password";
  var SECTION_AUTH_ACCOUNT = "auth.account";
  var SECTION_ORIGINS = "origins";
  var AUTH_CONFIG_ATTRIBUTE = "auth-config";
  var AUTH_PATH_VALIDATION_ORIGIN = "https://mpr-ui.invalid";
  var AUTH_PROVIDER_IDS = Object.freeze({
    GOOGLE: "google",
    APPLE: "apple",
    PASSWORD: "password",
  });
  var APPLE_RETURN_TARGET_POLICIES = Object.freeze({
    CURRENT_URL: "current-url",
    CURRENT_ORIGIN: "current-origin",
  });
  var AUTH_CONFIG_KEYS = Object.freeze([
    "tauthUrl",
    "tenantId",
    "logoutPath",
    "sessionPath",
    "providers",
    "password",
    "account",
  ]);
  var AUTH_PROVIDER_KEYS = Object.freeze([
    AUTH_PROVIDER_IDS.GOOGLE,
    AUTH_PROVIDER_IDS.APPLE,
    AUTH_PROVIDER_IDS.PASSWORD,
  ]);
  var GOOGLE_PROVIDER_KEYS = Object.freeze([
    "enabled",
    "clientId",
    "loginPath",
    "noncePath",
  ]);
  var APPLE_PROVIDER_KEYS = Object.freeze([
    "enabled",
    "startPath",
    "returnTo",
    "label",
  ]);
  var PASSWORD_PROVIDER_KEYS = Object.freeze(["enabled"]);
  var AUTH_PASSWORD_KEYS = Object.freeze([
    "loginPath",
    "signupPath",
    "verifyEmailPath",
    "resetStartPath",
    "resetCompletePath",
  ]);
  var AUTH_ACCOUNT_KEYS = Object.freeze([
    "passwordChangePath",
    "passwordLinkStartPath",
    "passwordLinkVerifyPath",
    "googleLinkPath",
    "unlinkPath",
    "disablePath",
  ]);
  var APPLE_PROVIDER_LABELS = Object.freeze([
    "Sign in with Apple",
    "Sign up with Apple",
    "Continue with Apple",
  ]);
  var BUNDLE_MARKER_SELECTOR = "script[data-mpr-ui-bundle-src]";
  var BUNDLE_MARKER_ERROR_MESSAGE =
    "mpr-ui auto-orchestration requires data-mpr-ui-bundle-src";
  var BUNDLE_API_ERROR_MESSAGE =
    "mpr-ui bundle must expose MPRUI.authenticatedFetch";
  var LATEST_BUNDLE_PATH_SEGMENT = "/mpr-ui@latest/";
  var BUNDLE_REVALIDATION_PARAMETER = "mpr-ui-revalidate";
  var EVENT_CONFIG_APPLIED = "mpr-ui:config:applied";
  var EVENT_BUNDLE_LOADED = "mpr-ui:bundle:loaded";
  var EVENT_ORCHESTRATION_READY = "mpr-ui:orchestration:ready";
  var ORCHESTRATION_RETRY_POLICY = Object.freeze({
    initialDelayMs: 1000,
    maximumDelayMs: 3000,
    multiplier: 2,
  });

  var yamlParserPromise = null;
  var bundleLoadPromise = null;
  var bundleRequestSequence = 0;
  var autoOrchestrationPromise = null;

  function createOrchestrationError(message, retryable, status) {
    var error = new Error(message);
    error.mprUiRetryable = retryable === true;
    if (typeof status === "number") {
      error.status = status;
    }
    return error;
  }

  function isRetryableStatus(status) {
    return (
      status === 408 ||
      status === 425 ||
      status === 429 ||
      status >= 500
    );
  }

  function orchestrationRetryDelay(attempt) {
    return Math.min(
      ORCHESTRATION_RETRY_POLICY.maximumDelayMs,
      ORCHESTRATION_RETRY_POLICY.initialDelayMs *
        Math.pow(ORCHESTRATION_RETRY_POLICY.multiplier, attempt),
    );
  }

  function waitForOrchestrationRetry(attempt) {
    return new Promise(function waitForRetry(resolve) {
      global.setTimeout(resolve, orchestrationRetryDelay(attempt));
    });
  }

  function retryTransientOperation(operation, attempt) {
    return Promise.resolve()
      .then(operation)
      .catch(function handleOperationFailure(error) {
        if (!error || error.mprUiRetryable !== true) {
          throw error;
        }
        return waitForOrchestrationRetry(attempt).then(function retryOperation() {
          return retryTransientOperation(operation, attempt + 1);
        });
      });
  }

  function ensureNamespace(target) {
    if (!target.MPRUI) {
      target.MPRUI = {};
    }
    return target.MPRUI;
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeOptions(options) {
    var resolved = Object.assign(
      {
        configUrl: DEFAULT_CONFIG_URL,
        yamlParserUrl: DEFAULT_YAML_PARSER_URL,
        headerSelector: DEFAULT_HEADER_SELECTOR,
        loginButtonSelector: DEFAULT_LOGIN_BUTTON_SELECTOR,
        userSelector: DEFAULT_USER_SELECTOR,
        passwordAuthSelector: DEFAULT_PASSWORD_AUTH_SELECTOR,
        accountPanelSelector: DEFAULT_ACCOUNT_PANEL_SELECTOR,
      },
      options || {},
    );
    return resolved;
  }

  function requireString(source, key, scope) {
    var value = source[key];
    if (typeof value !== "string" || value.trim().length === 0) {
      throw new Error(CONFIG_FILE_LABEL + " missing " + scope + "." + key);
    }
    return value.trim();
  }

  function requireStringAllowEmpty(source, key, scope) {
    if (!Object.prototype.hasOwnProperty.call(source, key)) {
      throw new Error(CONFIG_FILE_LABEL + " missing " + scope + "." + key);
    }
    var value = source[key];
    if (typeof value !== "string") {
      throw new Error(CONFIG_FILE_LABEL + " missing " + scope + "." + key);
    }
    return value.trim();
  }

  function requireObject(source, key, scope) {
    var value = source[key];
    if (!isPlainObject(value)) {
      throw new Error(CONFIG_FILE_LABEL + " missing " + scope + "." + key);
    }
    return value;
  }

  function rejectUnknownKeys(source, allowedKeys, scope) {
    Object.keys(source).forEach(function rejectUnknownKey(key) {
      if (allowedKeys.indexOf(key) === -1) {
        throw new Error(CONFIG_FILE_LABEL + " unknown " + scope + "." + key);
      }
    });
  }

  function requireBoolean(source, key, scope) {
    var value = source[key];
    if (typeof value !== "boolean") {
      throw new Error(CONFIG_FILE_LABEL + " missing " + scope + "." + key);
    }
    return value;
  }

  function isSameOriginNavigationPath(value) {
    if (
      value.charAt(0) !== "/" ||
      value.indexOf("//") === 0 ||
      value.indexOf("\\") !== -1 ||
      value.indexOf("?") !== -1 ||
      value.indexOf("#") !== -1
    ) {
      return false;
    }
    return new URL(value, AUTH_PATH_VALIDATION_ORIGIN).origin ===
      AUTH_PATH_VALIDATION_ORIGIN;
  }

  function requireBrowserAuthOrigin(source, key, scope) {
    var value = requireStringAllowEmpty(source, key, scope);
    if (!value) {
      return "";
    }
    var parsedUrl;
    try {
      parsedUrl = new URL(value);
    } catch (_error) {
      throw new Error(CONFIG_FILE_LABEL + " invalid " + scope + "." + key);
    }
    if (
      (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") ||
      parsedUrl.username ||
      parsedUrl.password ||
      parsedUrl.pathname !== "/" ||
      parsedUrl.search ||
      parsedUrl.hash
    ) {
      throw new Error(CONFIG_FILE_LABEL + " invalid " + scope + "." + key);
    }
    return parsedUrl.origin;
  }

  function requireNavigationPath(source, key, scope) {
    var value = requireString(source, key, scope);
    if (!isSameOriginNavigationPath(value)) {
      throw new Error(CONFIG_FILE_LABEL + " invalid " + scope + "." + key);
    }
    return value;
  }

  function requireAppleReturnTargetPolicy(source, key, scope) {
    var value = requireString(source, key, scope);
    if (
      value === APPLE_RETURN_TARGET_POLICIES.CURRENT_URL ||
      value === APPLE_RETURN_TARGET_POLICIES.CURRENT_ORIGIN
    ) {
      return value;
    }
    if (isSameOriginNavigationPath(value)) {
      return value;
    }
    throw new Error(CONFIG_FILE_LABEL + " invalid " + scope + "." + key);
  }

  function rejectDisabledProviderSettings(providerPayload, scope) {
    if (Object.keys(providerPayload).length !== 1) {
      throw new Error(CONFIG_FILE_LABEL + " disabled " + scope + " has settings");
    }
  }

  function buildGoogleProviderConfig(providersPayload) {
    var scope = SECTION_AUTH_PROVIDERS + "." + AUTH_PROVIDER_IDS.GOOGLE;
    var providerPayload = requireObject(
      providersPayload,
      AUTH_PROVIDER_IDS.GOOGLE,
      SECTION_AUTH_PROVIDERS,
    );
    rejectUnknownKeys(providerPayload, GOOGLE_PROVIDER_KEYS, scope);
    var enabled = requireBoolean(providerPayload, "enabled", scope);
    if (!enabled) {
      rejectDisabledProviderSettings(providerPayload, scope);
      return Object.freeze({ enabled: false });
    }
    return Object.freeze({
      enabled: true,
      clientId: requireString(providerPayload, "clientId", scope),
      loginPath: requireNavigationPath(providerPayload, "loginPath", scope),
      noncePath: requireNavigationPath(providerPayload, "noncePath", scope),
    });
  }

  function buildAppleProviderConfig(providersPayload) {
    var scope = SECTION_AUTH_PROVIDERS + "." + AUTH_PROVIDER_IDS.APPLE;
    var providerPayload = requireObject(
      providersPayload,
      AUTH_PROVIDER_IDS.APPLE,
      SECTION_AUTH_PROVIDERS,
    );
    rejectUnknownKeys(providerPayload, APPLE_PROVIDER_KEYS, scope);
    var enabled = requireBoolean(providerPayload, "enabled", scope);
    if (!enabled) {
      rejectDisabledProviderSettings(providerPayload, scope);
      return Object.freeze({ enabled: false });
    }
    var label = requireString(providerPayload, "label", scope);
    if (APPLE_PROVIDER_LABELS.indexOf(label) === -1) {
      throw new Error(CONFIG_FILE_LABEL + " invalid " + scope + ".label");
    }
    return Object.freeze({
      enabled: true,
      startPath: requireNavigationPath(providerPayload, "startPath", scope),
      returnTo: requireAppleReturnTargetPolicy(providerPayload, "returnTo", scope),
      label: label,
    });
  }

  function buildPasswordProviderConfig(providersPayload) {
    var scope = SECTION_AUTH_PROVIDERS + "." + AUTH_PROVIDER_IDS.PASSWORD;
    var providerPayload = requireObject(
      providersPayload,
      AUTH_PROVIDER_IDS.PASSWORD,
      SECTION_AUTH_PROVIDERS,
    );
    rejectUnknownKeys(providerPayload, PASSWORD_PROVIDER_KEYS, scope);
    return Object.freeze({
      enabled: requireBoolean(providerPayload, "enabled", scope),
    });
  }

  function buildAuthPathConfig(authPayload, sectionKey, allowedKeys, scope) {
    if (!Object.prototype.hasOwnProperty.call(authPayload, sectionKey)) {
      return null;
    }
    var sectionPayload = requireObject(authPayload, sectionKey, SECTION_AUTH);
    rejectUnknownKeys(sectionPayload, allowedKeys, scope);
    var normalizedPaths = {};
    allowedKeys.forEach(function buildPath(key) {
      normalizedPaths[key] = requireNavigationPath(sectionPayload, key, scope);
    });
    return Object.freeze(normalizedPaths);
  }

  function buildAuthProvidersConfig(authPayload) {
    var providersPayload = requireObject(authPayload, "providers", SECTION_AUTH);
    rejectUnknownKeys(providersPayload, AUTH_PROVIDER_KEYS, SECTION_AUTH_PROVIDERS);
    var googleProvider = buildGoogleProviderConfig(providersPayload);
    var appleProvider = buildAppleProviderConfig(providersPayload);
    var passwordProvider = buildPasswordProviderConfig(providersPayload);
    if (!googleProvider.enabled && !appleProvider.enabled && !passwordProvider.enabled) {
      throw new Error(CONFIG_FILE_LABEL + " requires an enabled auth provider");
    }
    return Object.freeze({
      google: googleProvider,
      apple: appleProvider,
      password: passwordProvider,
    });
  }

  function readStringArray(source, key) {
    var value = source[key];
    if (!Array.isArray(value)) {
      return [];
    }
    return value
      .map(function mapEntry(entry) {
        return typeof entry === "string" ? entry.trim() : "";
      })
      .filter(function filterEntry(entry) {
        return entry.length > 0;
      });
  }

  function requireEnvironments(value) {
    if (!Array.isArray(value) || value.length === 0) {
      throw new Error(CONFIG_FILE_LABEL + " missing environments");
    }
    return value.map(function mapEnvironment(environment, index) {
      if (!isPlainObject(environment)) {
        throw new Error(
          CONFIG_FILE_LABEL + " environment at index " + index + " must be an object",
        );
      }
      if (Object.prototype.hasOwnProperty.call(environment, "authButton")) {
        throw new Error(
          CONFIG_FILE_LABEL + " does not allow authButton; declare login-button presentation in static markup",
        );
      }
      return environment;
    });
  }

  function requireRuntimeOrigin() {
    var location = global.location;
    var origin = location && typeof location.origin === "string" ? location.origin : "";
    if (!origin) {
      throw new Error("window.location.origin is required for config selection");
    }
    return origin;
  }

  function selectEnvironment(environments, runtimeOrigin) {
    var matches = environments.filter(function filterEnvironment(environment) {
      var origins = readStringArray(environment, SECTION_ORIGINS);
      if (origins.length === 0) {
        throw new Error(CONFIG_FILE_LABEL + " environment missing origins");
      }
      return origins.indexOf(runtimeOrigin) !== -1;
    });
    if (matches.length === 0) {
      throw new Error(
        CONFIG_FILE_LABEL + " has no environment for origin " + runtimeOrigin,
      );
    }
    if (matches.length > 1) {
      throw new Error(
        CONFIG_FILE_LABEL + " has multiple environments for origin " + runtimeOrigin,
      );
    }
    return matches[0];
  }

  function buildAuthConfig(environment) {
    var authPayload = requireObject(environment, SECTION_AUTH, SECTION_AUTH);
    rejectUnknownKeys(authPayload, AUTH_CONFIG_KEYS, SECTION_AUTH);
    var providers = buildAuthProvidersConfig(authPayload);
    var password = buildAuthPathConfig(
      authPayload,
      "password",
      AUTH_PASSWORD_KEYS,
      SECTION_AUTH_PASSWORD,
    );
    var account = buildAuthPathConfig(
      authPayload,
      "account",
      AUTH_ACCOUNT_KEYS,
      SECTION_AUTH_ACCOUNT,
    );
    if (providers.password.enabled && !password) {
      throw new Error(CONFIG_FILE_LABEL + " missing auth.password");
    }
    var normalizedConfig = {
      tauthUrl: requireBrowserAuthOrigin(authPayload, "tauthUrl", SECTION_AUTH),
      tenantId: requireString(authPayload, "tenantId", SECTION_AUTH),
      logoutPath: requireNavigationPath(authPayload, "logoutPath", SECTION_AUTH),
      sessionPath: requireNavigationPath(authPayload, "sessionPath", SECTION_AUTH),
      providers: providers,
    };
    if (password) {
      normalizedConfig.password = password;
    }
    if (account) {
      normalizedConfig.account = account;
    }
    return Object.freeze(normalizedConfig);
  }

  function buildRuntimeConfig(environment) {
    var origins = readStringArray(environment, SECTION_ORIGINS);
    var description = typeof environment.description === "string" ? environment.description.trim() : "";
    return Object.freeze({
      description: description,
      origins: origins,
      auth: buildAuthConfig(environment),
    });
  }

  function loadScript(scriptUrl) {
    return new Promise(function executor(resolve, reject) {
      if (!global.document || !global.document.createElement) {
        reject(new Error("document is required to load " + scriptUrl));
        return;
      }
      var scriptElement = global.document.createElement("script");
      scriptElement.async = true;
      scriptElement.defer = true;
      scriptElement.src = scriptUrl;
      scriptElement.onload = function handleLoad() {
        resolve();
      };
      scriptElement.onerror = function handleError() {
        reject(createOrchestrationError("Failed to load " + scriptUrl, true));
      };
      if (global.document.head && typeof global.document.head.appendChild === "function") {
        global.document.head.appendChild(scriptElement);
      } else {
        reject(new Error("document.head is required to load " + scriptUrl));
      }
    });
  }

  function ensureYamlParser(parserUrl) {
    if (global.jsyaml && typeof global.jsyaml.load === "function") {
      return Promise.resolve(global.jsyaml);
    }
    if (yamlParserPromise) {
      return yamlParserPromise;
    }
    yamlParserPromise = loadScript(parserUrl)
      .then(function resolveParser() {
        if (global.jsyaml && typeof global.jsyaml.load === "function") {
          return global.jsyaml;
        }
        throw new Error("js-yaml parser did not initialize");
      })
      .catch(function resetFailedParserLoad(error) {
        yamlParserPromise = null;
        throw error;
      });
    return yamlParserPromise;
  }

  function fetchConfig(configUrl) {
    if (!global.fetch) {
      return Promise.reject(new Error("fetch is required to load " + CONFIG_FILE_LABEL));
    }
    return global.fetch(configUrl, { cache: "no-store" })
      .then(function parseResponse(response) {
        if (!response || !response.ok) {
          var status = response ? response.status : "unknown";
          throw createOrchestrationError(
            CONFIG_FILE_LABEL + " request failed (" + status + ")",
            typeof status !== "number" || isRetryableStatus(status),
            typeof status === "number" ? status : undefined,
          );
        }
        return response.text();
      })
      .catch(function classifyConfigRequestFailure(error) {
        if (error && typeof error.mprUiRetryable === "boolean") {
          throw error;
        }
        throw createOrchestrationError(
          CONFIG_FILE_LABEL + " request failed (network)",
          true,
        );
      });
  }

  function parseConfigYaml(configText, parser) {
    var parsed = parser.load(configText);
    if (!isPlainObject(parsed)) {
      throw new Error(CONFIG_FILE_LABEL + " must be an object");
    }
    return parsed;
  }

  function loadYamlConfigInternal(options) {
    var runtimeOrigin = requireRuntimeOrigin();
    return ensureYamlParser(options.yamlParserUrl)
      .then(function parseYaml(parser) {
        return fetchConfig(options.configUrl).then(function handleYamlText(configText) {
          var parsed = parseConfigYaml(configText, parser);
          var environments = requireEnvironments(parsed[SECTION_ENVIRONMENTS]);
          var selected = selectEnvironment(environments, runtimeOrigin);
          return buildRuntimeConfig(selected);
        });
      });
  }

  /* node:coverage disable */
  function ensureDocumentReady() {
    if (!global.document) {
      return Promise.reject(new Error("document is required to apply config"));
    }
    if (global.document.readyState && global.document.readyState !== "loading") {
      return Promise.resolve();
    }
    return new Promise(function waitForReady(resolve) {
      global.document.addEventListener("DOMContentLoaded", resolve, { once: true });
    });
  }
  /* node:coverage enable */

  function dispatchDocumentEvent(eventName, detail) {
    if (!global.document || typeof global.document.dispatchEvent !== "function") {
      return;
    }
    if (typeof global.CustomEvent !== "function") {
      return;
    }
    global.document.dispatchEvent(new global.CustomEvent(eventName, { detail: detail }));
  }

  function setAttributeValue(targetElement, attributeName, attributeValue) {
    if (!targetElement || typeof targetElement.setAttribute !== "function") {
      return;
    }
    /* node:coverage disable */
    if (attributeValue === undefined || attributeValue === null) {
      return;
    }
    /* node:coverage enable */
    targetElement.setAttribute(attributeName, String(attributeValue));
  }

  function applyAuthAttributes(targetElement, authConfig) {
    setAttributeValue(targetElement, AUTH_CONFIG_ATTRIBUTE, JSON.stringify(authConfig));
  }

  function applyHeaderAttributes(headerElement, authConfig) {
    applyAuthAttributes(headerElement, authConfig);
  }

  function applyLoginButtonAttributes(loginButton, authConfig) {
    applyAuthAttributes(loginButton, authConfig);
  }

  function applyUserAttributes(userElement, authConfig) {
    applyAuthAttributes(userElement, authConfig);
  }

  function applyConfigToDom(runtimeConfig, options) {
    var headers = Array.from(global.document.querySelectorAll(options.headerSelector));
    var loginButtons = Array.from(global.document.querySelectorAll(options.loginButtonSelector));
    var userMenus = Array.from(global.document.querySelectorAll(options.userSelector));
    var passwordForms = Array.from(
      global.document.querySelectorAll(options.passwordAuthSelector),
    );
    var accountPanels = Array.from(
      global.document.querySelectorAll(options.accountPanelSelector),
    );
    if (headers.length > 0) {
      headers.forEach(function updateHeader(headerElement) {
        applyHeaderAttributes(headerElement, runtimeConfig.auth);
      });
    }
    if (loginButtons.length > 0) {
      loginButtons.forEach(function updateLogin(loginButton) {
        applyLoginButtonAttributes(loginButton, runtimeConfig.auth);
      });
    }
    if (userMenus.length > 0) {
      userMenus.forEach(function updateUserMenu(userElement) {
        applyUserAttributes(userElement, runtimeConfig.auth);
      });
    }
    passwordForms.forEach(function updatePasswordForm(passwordForm) {
      applyAuthAttributes(passwordForm, runtimeConfig.auth);
    });
    accountPanels.forEach(function updateAccountPanel(accountPanel) {
      applyAuthAttributes(accountPanel, runtimeConfig.auth);
    });
    return runtimeConfig;
  }

  function readBundleMarkerSource(bundleMarker) {
    if (!bundleMarker || typeof bundleMarker.getAttribute !== "function") {
      throw new Error(BUNDLE_MARKER_ERROR_MESSAGE);
    }
    var bundleSource = bundleMarker.getAttribute("data-mpr-ui-bundle-src");
    if (typeof bundleSource !== "string" || bundleSource.trim().length === 0) {
      throw new Error(BUNDLE_MARKER_ERROR_MESSAGE);
    }
    return bundleSource.trim();
  }

  function createBundleRequestSource(bundleSource) {
    if (bundleSource.indexOf(LATEST_BUNDLE_PATH_SEGMENT) === -1) {
      return bundleSource;
    }
    bundleRequestSequence += 1;
    var bundleRequestUrl = new URL(bundleSource);
    bundleRequestUrl.searchParams.set(
      BUNDLE_REVALIDATION_PARAMETER,
      String(Date.now()) + "-" + String(bundleRequestSequence),
    );
    return bundleRequestUrl.toString();
  }

  function requireBundleApi() {
    if (!global.MPRUI || typeof global.MPRUI.authenticatedFetch !== "function") {
      throw new Error(BUNDLE_API_ERROR_MESSAGE);
    }
  }

  function loadBundleFromMarker(bundleMarker) {
    /* node:coverage disable */
    if (bundleLoadPromise) {
      return bundleLoadPromise;
    }
    /* node:coverage enable */
    var bundleSource = readBundleMarkerSource(bundleMarker);
    bundleLoadPromise = retryTransientOperation(function requestBundle() {
      return loadScript(createBundleRequestSource(bundleSource));
    }, 0).then(function resolveBundleLoad() {
      requireBundleApi();
      dispatchDocumentEvent(EVENT_BUNDLE_LOADED, { src: bundleSource });
      return bundleSource;
    });
    return bundleLoadPromise;
  }

  function resolveAutoOrchestrationTarget() {
    var header = document.querySelector('mpr-header[data-config-url]');
    if (header) {
      return {
        element: header,
        applyOptions: null,
      };
    }
    var loginButton = document.querySelector('mpr-login-button[data-config-url]');
    if (!loginButton) {
      return null;
    }
    return {
      element: loginButton,
      applyOptions: {
        headerSelector: 'mpr-header[data-config-url]',
      },
    };
  }

  var namespace = ensureNamespace(global);
  namespace.loadYamlConfig = function loadYamlConfig(options) {
    var resolved = normalizeOptions(options);
    return loadYamlConfigInternal(resolved);
  };
  namespace.applyYamlConfig = function applyYamlConfig(options) {
    var resolved = normalizeOptions(options);
    return loadYamlConfigInternal(resolved).then(function applyConfig(runtimeConfig) {
      return ensureDocumentReady().then(function finalizeApply() {
        var result = applyConfigToDom(runtimeConfig, resolved);
        dispatchDocumentEvent(EVENT_CONFIG_APPLIED, { config: resolved, runtimeConfig: result });
        return result;
      });
    });
  };
  namespace.whenAutoOrchestrationReady = function whenAutoOrchestrationReady() {
    if (autoOrchestrationPromise) {
      return autoOrchestrationPromise;
    }
    return Promise.resolve();
  };

  // MU-130: Automatic orchestration for components with data-config-url
  function autoOrchestrate() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') {
      return Promise.resolve();
    }
    if (autoOrchestrationPromise) {
      return autoOrchestrationPromise;
    }
    var orchestrationTarget = resolveAutoOrchestrationTarget();
    if (orchestrationTarget) {
      var configUrl = orchestrationTarget.element.getAttribute('data-config-url');
      if (configUrl) {
        var bundleMarker = document.querySelector(BUNDLE_MARKER_SELECTOR);
        var applyOptions = Object.assign(
          { configUrl: configUrl },
          orchestrationTarget.applyOptions || {},
        );
        autoOrchestrationPromise = retryTransientOperation(function requestConfig() {
          return global.MPRUI.applyYamlConfig(applyOptions);
        }, 0)
          .then(function handleConfigApplied() {
            return loadBundleFromMarker(bundleMarker);
          })
          .then(function finalizeOrchestration() {
            dispatchDocumentEvent(EVENT_ORCHESTRATION_READY, { configUrl: configUrl });
          });
        autoOrchestrationPromise.catch(function handleOrchestrationError(err) {
          // eslint-disable-next-line no-console
          console.error('[mpr-ui-config] Auto-orchestration failed:', err);
        });
        return autoOrchestrationPromise;
      }
    }
    return Promise.resolve();
  }

  if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', autoOrchestrate);
    } else {
      autoOrchestrate();
    }
  }
})(typeof window !== "undefined" ? window : globalThis);
