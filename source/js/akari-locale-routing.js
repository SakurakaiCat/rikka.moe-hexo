(function (window, document) {
  'use strict';

  var config = window.__AKARI_LOCALE_ROUTING__;

  if (!config || !Array.isArray(config.locales) || !config.preferenceKey) {
    return;
  }

  var localeMap = {};

  function normalizeLanguageTag(languageTag) {
    return String(languageTag || '')
      .trim()
      .replace(/_/g, '-')
      .toLowerCase();
  }

  config.locales.forEach(function (locale) {
    if (!locale || locale.key === undefined || locale.key === null) {
      return;
    }

    localeMap[locale.key] = locale;

    var normalizedKey = normalizeLanguageTag(locale.key);

    if (normalizedKey && !localeMap[normalizedKey]) {
      localeMap[normalizedKey] = locale;
    }
  });

  function normalizeLocaleKey(localeKey) {
    var normalized = normalizeLanguageTag(localeKey);
    return localeMap[normalized] ? normalized : null;
  }

  function matchesBrowserLanguagePattern(pattern, normalizedLanguageTag) {
    var normalizedPattern = normalizeLanguageTag(pattern);

    if (!normalizedPattern || !normalizedLanguageTag) {
      return false;
    }

    if (normalizedPattern.charAt(normalizedPattern.length - 1) === '*') {
      var prefix = normalizedPattern.slice(0, -1);
      return prefix ? normalizedLanguageTag.indexOf(prefix) === 0 : false;
    }

    return normalizedPattern === normalizedLanguageTag;
  }

  function readStoredLocalePreference() {
    try {
      return normalizeLocaleKey(window.localStorage.getItem(config.preferenceKey));
    } catch (error) {
      return null;
    }
  }

  function writeStoredLocalePreference(localeKey) {
    var normalized = normalizeLocaleKey(localeKey);

    if (!normalized) {
      return;
    }

    try {
      window.localStorage.setItem(config.preferenceKey, normalized);
    } catch (error) {
      return;
    }
  }

  function resolveLocaleFromBrowserLanguages() {
    var languages = [];

    if (window.navigator && Array.isArray(window.navigator.languages) && window.navigator.languages.length) {
      languages = window.navigator.languages;
    } else if (window.navigator && window.navigator.language) {
      languages = [window.navigator.language];
    }

    for (var languageIndex = 0; languageIndex < languages.length; languageIndex += 1) {
      var normalizedLanguageTag = normalizeLanguageTag(languages[languageIndex]);

      for (var localeIndex = 0; localeIndex < config.locales.length; localeIndex += 1) {
        var locale = config.locales[localeIndex];
        var patterns = locale && Array.isArray(locale.browserLangPatterns) ? locale.browserLangPatterns : [];

        for (var patternIndex = 0; patternIndex < patterns.length; patternIndex += 1) {
          if (matchesBrowserLanguagePattern(patterns[patternIndex], normalizedLanguageTag)) {
            return locale.key;
          }
        }
      }
    }

    return normalizeLocaleKey(config.defaultLocaleKey);
  }

  function resolvePreferredLocaleKey() {
    return readStoredLocalePreference() || resolveLocaleFromBrowserLanguages();
  }

  function resolveLocaleKeyFromCurrentPage() {
    if (!document || !document.documentElement) {
      return null;
    }

    var pathLocale = normalizeLocaleKey(window.location.pathname.split('/').filter(Boolean)[0]);

    if (pathLocale) {
      return pathLocale;
    }

    return normalizeLocaleKey(document.documentElement.lang);
  }

  function applyFontLocalePreference() {
    if (!document || !document.documentElement) {
      return;
    }

    var fontLocale = resolveLocaleKeyFromCurrentPage() || resolvePreferredLocaleKey();

    if (!fontLocale) {
      document.documentElement.removeAttribute('data-font-locale');
      return;
    }

    document.documentElement.setAttribute('data-font-locale', fontLocale);
  }

  function resolveTargetHomePath() {
    var preferredLocale = resolvePreferredLocaleKey();
    var locale = localeMap[preferredLocale] || localeMap[normalizeLocaleKey(config.defaultLocaleKey)];

    return locale ? locale.homePath : config.defaultLocaleHomePath;
  }

  function resolveCurrentPathDirectory() {
    var path = window.location.pathname || '/';
    var lastSlashIndex = path.lastIndexOf('/');

    if (lastSlashIndex === -1) {
      return '/';
    }

    if (lastSlashIndex === path.length - 1) {
      return path;
    }

    return path.slice(0, lastSlashIndex + 1);
  }

  function preserveLocalePreference(eventTarget) {
    var cursor = eventTarget;

    while (cursor && cursor !== document) {
      if (cursor.getAttribute) {
        var localeKey = cursor.getAttribute('data-locale-preference');

        if (localeKey) {
          writeStoredLocalePreference(localeKey);
          return;
        }
      }

      cursor = cursor.parentNode;
    }
  }

  document.addEventListener('click', function (event) {
    preserveLocalePreference(event.target);
  }, true);

  applyFontLocalePreference();

  if (!config.rootAutoRedirect) {
    return;
  }

  var targetHomePath = resolveTargetHomePath();

  if (!targetHomePath) {
    return;
  }

  if (targetHomePath === resolveCurrentPathDirectory()) {
    return;
  }

  window.location.replace(targetHomePath + window.location.search + window.location.hash);
})(window, document);
