// Shared rule normalization module.
// Loaded into:
//   - Service worker (background.js) via importScripts()
//   - Content script (content.js) via registerContentScripts ordering
// Attaches a single namespace `RuleNormalize` onto the current global
// so both contexts can call the same logic instead of maintaining
// two drifting copies.

(function (global) {
  'use strict';

  const DEFAULT_MATCH_MODE = 'contains';
  const DEFAULT_METHOD = 'ALL';
  const DEFAULT_PRIORITY = 0;
  const DEFAULT_STATUS = 200;
  const DEFAULT_DELAY_MS = 0;
  const DEFAULT_CONTENT_TYPE = 'text/plain; charset=utf-8';

  const ALLOWED_MATCH_MODES = new Set(['exact', 'wildcard', 'contains']);

  function normalizeMethod(method) {
    const normalized = String(method || DEFAULT_METHOD).toUpperCase();
    return normalized || DEFAULT_METHOD;
  }

  function normalizeMatchMode(matchMode) {
    return ALLOWED_MATCH_MODES.has(matchMode) ? matchMode : DEFAULT_MATCH_MODE;
  }

  function inferMatchMode(matchMode, urlPattern) {
    if (matchMode) {
      return normalizeMatchMode(matchMode);
    }
    return String(urlPattern || '').includes('*') ? 'wildcard' : DEFAULT_MATCH_MODE;
  }

  function normalizePriority(priority) {
    const value = Number(priority);
    if (!Number.isFinite(value)) {
      return DEFAULT_PRIORITY;
    }
    return Math.trunc(value);
  }

  function normalizeStatus(status) {
    const value = Number(status);
    if (!Number.isInteger(value) || value < 100 || value > 599) {
      return DEFAULT_STATUS;
    }
    return value;
  }

  function normalizeDelayMs(delayMs) {
    const value = Number(delayMs);
    if (!Number.isFinite(value) || value < 0) {
      return DEFAULT_DELAY_MS;
    }
    return Math.trunc(value);
  }

  function normalizeResponseHeaders(headers) {
    if (!headers || typeof headers !== 'object' || Array.isArray(headers)) {
      return {};
    }

    const normalized = {};
    for (const [key, value] of Object.entries(headers)) {
      const headerName = String(key || '').trim();
      if (!headerName) continue;
      normalized[headerName] = String(value ?? '');
    }
    return normalized;
  }

  function isLikelyJsonContent(value) {
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      return false;
    }

    try {
      JSON.parse(trimmed);
      return true;
    } catch (err) {
      return false;
    }
  }

  function getRuleContentType(rule) {
    const headers = normalizeResponseHeaders(rule.responseHeaders);
    const headerKey = Object.keys(headers).find(key => key.toLowerCase() === 'content-type');
    if (headerKey) {
      return headers[headerKey];
    }
    if (rule.contentType) {
      return rule.contentType;
    }
    return isLikelyJsonContent(rule.responseBody) ? 'application/json' : DEFAULT_CONTENT_TYPE;
  }

  function normalizeRule(rule) {
    const normalized = {
      ...rule,
      method: normalizeMethod(rule.method),
      matchMode: inferMatchMode(rule.matchMode, rule.urlPattern),
      priority: normalizePriority(rule.priority),
      responseStatus: normalizeStatus(rule.responseStatus),
      responseDelayMs: normalizeDelayMs(rule.responseDelayMs),
      responseHeaders: normalizeResponseHeaders(rule.responseHeaders)
    };

    normalized.contentType = getRuleContentType(normalized);
    return normalized;
  }

  function sortMockRules(rules) {
    return rules
      .map((rule, index) => ({ rule, index }))
      .sort((a, b) => {
        const priorityDiff = normalizePriority(b.rule.priority) - normalizePriority(a.rule.priority);
        if (priorityDiff !== 0) return priorityDiff;
        return a.index - b.index;
      })
      .map(item => item.rule);
  }

  function extractMockRules(allRules) {
    return sortMockRules(
      (allRules || [])
        .filter(rule => rule.enabled && rule.type === 'mockResponse')
        .map(normalizeRule)
    );
  }

  global.RuleNormalize = {
    DEFAULT_MATCH_MODE,
    DEFAULT_METHOD,
    DEFAULT_PRIORITY,
    DEFAULT_STATUS,
    DEFAULT_DELAY_MS,
    DEFAULT_CONTENT_TYPE,
    normalizeMethod,
    normalizeMatchMode,
    inferMatchMode,
    normalizePriority,
    normalizeStatus,
    normalizeDelayMs,
    normalizeResponseHeaders,
    isLikelyJsonContent,
    getRuleContentType,
    normalizeRule,
    sortMockRules,
    extractMockRules
  };
})(typeof globalThis !== 'undefined' ? globalThis : self);
