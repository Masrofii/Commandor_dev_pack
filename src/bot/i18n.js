'use strict';

const i18n = require('../i18n');

module.exports = {
  t: i18n.t,
  isRtl: i18n.isRtl,
  getLanguageMeta: i18n.getLanguageMeta,
  detectLanguage: i18n.detectLanguage,
  SUPPORTED_LANGUAGES: i18n.SUPPORTED_LANGUAGES,
  SUPPORTED_CODES: i18n.SUPPORTED_CODES,
  translations: i18n.catalogs
};
