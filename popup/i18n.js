/**
 * Internationalization (i18n) Module
 * Supports English (default) and Chinese
 */

// Supported languages
const SUPPORTED_LANGUAGES = ['en', 'zh_CN'];
const DEFAULT_LANGUAGE = 'en';
const STORAGE_KEY = 'preferredLanguage';

// Language messages cache
let messages = {};
let currentLanguage = DEFAULT_LANGUAGE;
let isInitialized = false;

/**
 * Get browser language preference
 * @returns {string} Language code
 */
function getBrowserLanguage() {
  const lang = navigator.language || navigator.userLanguage;
  // Map browser language to supported language
  if (lang.startsWith('zh')) {
    return 'zh_CN';
  }
  return 'en';
}

/**
 * Load messages for a specific language
 * @param {string} lang Language code
 * @returns {Promise<Object>} Messages object
 */
async function loadMessages(lang) {
  try {
    const response = await fetch(chrome.runtime.getURL(`_locales/${lang}/messages.json`));
    if (!response.ok) {
      throw new Error(`Failed to load ${lang} messages`);
    }
    return await response.json();
  } catch (error) {
    console.error(`[i18n] Error loading messages for ${lang}:`, error);
    // Fallback to default language if not already trying to load it
    if (lang !== DEFAULT_LANGUAGE) {
      return loadMessages(DEFAULT_LANGUAGE);
    }
    return {};
  }
}

/**
 * Initialize the i18n module
 * @returns {Promise<void>}
 */
async function initI18n() {
  if (isInitialized) return;
  
  // Try to get saved preference, default to English
  const result = await new Promise(resolve => {
    chrome.storage.local.get([STORAGE_KEY], resolve);
  });
  
  const savedLang = result[STORAGE_KEY];
  currentLanguage = savedLang && SUPPORTED_LANGUAGES.includes(savedLang) 
    ? savedLang 
    : DEFAULT_LANGUAGE;
  
  // Load messages
  messages = await loadMessages(currentLanguage);
  isInitialized = true;
  
  // Apply translations to the page
  applyTranslations();
}

/**
 * Get a translated message
 * @param {string} key Message key
 * @param {Array<string>} substitutions Optional substitutions for placeholders
 * @returns {string} Translated message
 */
function getMessage(key, substitutions = []) {
  const entry = messages[key];
  if (!entry) {
    console.warn(`[i18n] Missing translation for key: ${key}`);
    return key;
  }
  
  let message = entry.message;
  
  // Handle substitutions
  if (substitutions.length > 0 && entry.placeholders) {
    Object.keys(entry.placeholders).forEach((placeholderName, index) => {
      const placeholder = entry.placeholders[placeholderName];
      const contentMatch = placeholder.content.match(/\$(\d+)/);
      if (contentMatch) {
        const subIndex = parseInt(contentMatch[1], 10) - 1;
        if (subIndex < substitutions.length) {
          const regex = new RegExp(`\\$${placeholderName.toUpperCase()}\\$`, 'g');
          message = message.replace(regex, substitutions[subIndex]);
        }
      }
    });
  }
  
  return message;
}

/**
 * Shorthand for getMessage
 * @param {string} key Message key
 * @param {...string} substitutions Optional substitutions
 * @returns {string} Translated message
 */
function t(key, ...substitutions) {
  return getMessage(key, substitutions);
}

/**
 * Apply translations to all elements with data-i18n attribute
 */
function applyTranslations() {
  // Translate elements with [data-i18n] attribute
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.getAttribute('data-i18n');
    const translation = getMessage(key);
    if (translation !== key) {
      el.textContent = translation;
    }
  });
  
  // Translate elements with [data-i18n-placeholder] attribute
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    const key = el.getAttribute('data-i18n-placeholder');
    const translation = getMessage(key);
    if (translation !== key) {
      el.placeholder = translation;
    }
  });
  
  // Translate elements with [data-i18n-title] attribute
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    const key = el.getAttribute('data-i18n-title');
    const translation = getMessage(key);
    if (translation !== key) {
      el.title = translation;
      // Also update data-tooltip if it exists
      if (el.hasAttribute('data-tooltip')) {
        el.setAttribute('data-tooltip', translation);
      }
    }
  });
  
  // Update HTML lang attribute
  document.documentElement.lang = currentLanguage === 'zh_CN' ? 'zh-CN' : 'en';
}

/**
 * Switch to a different language
 * @param {string} lang Language code
 * @returns {Promise<void>}
 */
async function setLanguage(lang) {
  if (!SUPPORTED_LANGUAGES.includes(lang)) {
    console.error(`[i18n] Unsupported language: ${lang}`);
    return;
  }
  
  currentLanguage = lang;
  messages = await loadMessages(lang);
  
  // Save preference
  await new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY]: lang }, resolve);
  });
  
  // Apply translations
  applyTranslations();
  
  // Dispatch event for components that need to react to language change
  window.dispatchEvent(new CustomEvent('languageChanged', { detail: { language: lang } }));
}

/**
 * Get current language
 * @returns {string} Current language code
 */
function getCurrentLanguage() {
  return currentLanguage;
}

/**
 * Get list of supported languages
 * @returns {Array<{code: string, name: string}>}
 */
function getSupportedLanguages() {
  return [
    { code: 'en', name: 'English' },
    { code: 'zh_CN', name: '中文' }
  ];
}

// Export functions
window.i18n = {
  init: initI18n,
  t: t,
  getMessage: getMessage,
  setLanguage: setLanguage,
  getCurrentLanguage: getCurrentLanguage,
  getSupportedLanguages: getSupportedLanguages,
  applyTranslations: applyTranslations
};
